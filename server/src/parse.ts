/**
 * Turning a model's answer into data we can trust.
 *
 * The meal routes used to do `JSON.parse(text)` and return a 502 on any
 * surprise. Two surprises were common enough to break real use:
 *
 *  - **Arabic-Indic digits.** Asked to answer in Arabic about "٧٠٠ جرام", the
 *    model would answer in kind and emit `"calories": ٦٢٠`, which is not valid
 *    JSON at all — so a perfectly good analysis came back as "Something went
 *    wrong".
 *  - **A sentence around the JSON.** "Here is the analysis: {...}" parses only
 *    after the prose is stripped.
 *
 * Everything here is deliberately forgiving on the way in and strict on the way
 * out: the app gets a well-formed MealAnalysis or a thrown error, never a
 * half-filled object.
 */
import Anthropic from '@anthropic-ai/sdk';

/**
 * Every text block of a reply joined into one string — not just the first.
 * A plain answer has exactly one, so this changes nothing for it; a
 * web-search turn puts "Let me look that up…" in one block and the actual
 * answer in a later one, and taking only the first used to hand back prose
 * with no JSON in it at all.
 */
export function replyText(response: { content: unknown[]; stop_reason?: string | null }): string {
  if (response.stop_reason === 'max_tokens') {
    throw new Error('model reply hit max_tokens and was cut off');
  }
  return (response.content as { type: string; text?: string }[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();
}

/**
 * Domains a web search actually cited, for a small "checked: mcdonalds.com"
 * credibility note — capped low since this is a courtesy, not a citation
 * requirement (the numbers are reprocessed into macros, not quoted verbatim).
 */
export function citationDomains(response: { content: unknown[] }): string[] {
  const seen = new Set<string>();
  for (const block of response.content as {
    type: string;
    citations?: { type: string; url?: string }[];
  }[]) {
    if (block.type !== 'text') continue;
    for (const citation of block.citations ?? []) {
      if (citation.type !== 'web_search_result_location' || !citation.url) continue;
      try {
        seen.add(new URL(citation.url).hostname.replace(/^www\./, ''));
      } catch {
        // malformed url from the tool result — skip it
      }
    }
  }
  return [...seen].slice(0, 3);
}

/** True when the account/org has web search turned off in the Console. */
export function isWebSearchDisabled(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 400 && /web search/i.test(err.message);
}

/** True when the Anthropic account is out of credit — every AI route used
 * to map this to the same generic "analysis failed" as a transient glitch,
 * which reads as "try again" when the real fix is "add credit". */
export function isInsufficientCreditError(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 400 && /credit balance/i.test(err.message);
}

/** Arabic-Indic (٠-٩) and Extended/Persian (۰-۹) digits → ASCII. */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * Pull the JSON value out of a reply that may be fenced, prefixed with prose,
 * or written with non-ASCII digits. Throws when there is nothing parseable.
 */
export function extractJson(raw: string): unknown {
  const cleaned = asciiDigits(
    raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  );
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to the outermost braces, which survives a wrapping sentence.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error(`no JSON object in model reply: ${cleaned.slice(0, 200)}`);
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/**
 * A number out of whatever the model wrote: a real number, a quoted one, a
 * range ("600-700" → the midpoint, since either end is a defensible estimate),
 * or one dressed up with units or a tilde.
 */
export function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;
  const text = asciiDigits(value).replace(/,/g, '');
  const range = text.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  const single = text.match(/-?\d+(?:\.\d+)?/);
  return single ? parseFloat(single[0]) : fallback;
}

/** A blank string counts as missing, so a default can stand in for it. */
function str(value: unknown, fallback = ''): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

export interface FoodItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portion: string;
}

export interface MealAnalysis {
  items: FoodItem[];
  confidence: number;
  notes: string;
  /** Domains checked via web search, when a named restaurant/product triggered one. */
  sources?: string[];
}

/** Food energy from macros: the Atwater factors every nutrition label uses. */
export function atwater(item: Pick<FoodItem, 'proteinG' | 'carbsG' | 'fatG'>): number {
  return item.proteinG * 4 + item.carbsG * 4 + item.fatG * 9;
}

/**
 * Make one item's calories agree with its own macros.
 *
 * The model estimates calories and macros separately, and its two answers rarely
 * match to the kcal — so the ring said "2119 eaten" while the macro row added up
 * to 2098, and a user checking the arithmetic found the app wrong. It was: those
 * were two independent estimates of the same meal.
 *
 * Calories become the exact Atwater sum, which makes the two rows agree by
 * construction at every level (the totals are plain sums, so if each item
 * balances, so does the day). Where the model's own calorie figure is HIGHER
 * than its macros imply, the macros are scaled up to meet it first: the calorie
 * estimate is the number the prompt is tuned for, and for a calorie tracker
 * quietly rounding a meal down is the worse failure.
 */
/**
 * Grow the macros by `scale`, handing out the leftover grams so the total energy
 * lands as close to `target` as whole grams allow.
 *
 * Rounding each macro on its own looks equivalent and is not: at a large scale
 * factor three downward roundings compound, and 5/5/5 g stretched to 620 kcal
 * came out at 612 — the very kind of quiet shortfall this reconciliation exists
 * to prevent.
 */
function scaleMacros(item: FoodItem, scale: number, target: number): FoodItem {
  const exact = [item.proteinG * scale, item.carbsG * scale, item.fatG * scale];
  const grams = exact.map(Math.floor);
  const kcalPerG = [4, 4, 9];
  const energy = () => grams[0] * 4 + grams[1] * 4 + grams[2] * 9;
  // Largest fractional part first, and only while it closes the gap.
  const order = [0, 1, 2].sort((a, b) => exact[b] - grams[b] - (exact[a] - grams[a]));
  for (const i of order) {
    if (Math.abs(energy() + kcalPerG[i] - target) < Math.abs(energy() - target)) grams[i] += 1;
  }
  return { ...item, proteinG: grams[0], carbsG: grams[1], fatG: grams[2] };
}

function balance(item: FoodItem): FoodItem {
  const implied = atwater(item);
  // No macro breakdown to reconcile against — keep the stated calories.
  if (implied === 0) return item;
  // Within whole-gram rounding noise: leave the estimate's macros untouched and
  // simply state the energy they actually represent.
  if (item.calories > implied * 1.02) {
    item = scaleMacros(item, item.calories / implied, item.calories);
  }
  // Recomputed from the final whole grams, so it is exact rather than close.
  return { ...item, calories: atwater(item) };
}

/**
 * Coerce a model reply into the shape the app renders. Items without a name are
 * dropped rather than shown as a blank row; macros are rounded because the app
 * never displays decimals.
 *
 * `sources` comes from outside the JSON — the citations attached to a web
 * search the model ran while answering — so it is passed in separately rather
 * than trusted from the model's own text.
 */
export function toMealAnalysis(raw: string, sources?: string[]): MealAnalysis {
  const parsed = extractJson(raw) as Record<string, unknown>;
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items: FoodItem[] = [];
  for (const entry of rawItems) {
    const item = entry as Record<string, unknown>;
    const name = str(item?.name);
    if (!name) continue;
    items.push(
      balance({
        name,
        calories: Math.max(0, Math.round(num(item.calories))),
        proteinG: Math.max(0, Math.round(num(item.proteinG))),
        carbsG: Math.max(0, Math.round(num(item.carbsG))),
        fatG: Math.max(0, Math.round(num(item.fatG))),
        portion: str(item.portion, '1'),
      }),
    );
  }
  // An empty items array is a legitimate answer ("this photo has no food"), so
  // it is passed through — the app already has a message for it.
  const confidence = Math.min(1, Math.max(0, num(parsed?.confidence, items.length ? 0.5 : 0)));
  return {
    items,
    confidence,
    notes: str(parsed?.notes),
    ...(sources && sources.length > 0 ? { sources } : {}),
  };
}

// ── Body readings: a scanned InBody/Tanita/scale report ────────────────────

export interface SegmentalLeanMass {
  leftArm?: number;
  rightArm?: number;
  trunk?: number;
  leftLeg?: number;
  rightLeg?: number;
}

export type ZoneStatus = 'low' | 'normal' | 'high';

export interface SegmentalStatus {
  leftArm?: ZoneStatus;
  rightArm?: ZoneStatus;
  trunk?: ZoneStatus;
  leftLeg?: ZoneStatus;
  rightLeg?: ZoneStatus;
}

export interface BodyReadingAnalysis {
  deviceLabel?: string;
  testDate?: string;
  weightKg?: number;
  bodyFatPercent?: number;
  skeletalMuscleMassKg?: number;
  segmentalLeanMassKg?: SegmentalLeanMass;
  segmentalFatMassKg?: SegmentalLeanMass;
  segmentalLeanMassStatus?: SegmentalStatus;
  segmentalFatMassStatus?: SegmentalStatus;
  confidence: number;
}

/**
 * A number the model actually printed, or undefined — never a fabricated
 * default. `num()` above defaults to 0 on anything unparseable, which is
 * right for a meal's calories (0 is a legitimate value) but wrong here: a
 * body reading silently getting "0 kg" for a field the model wrote as
 * "82.5 kg" (units it wasn't supposed to include) or garbled text would
 * look like real data instead of the missing/malformed value it is.
 */
function numOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = asciiDigits(value).replace(/,/g, '');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : undefined;
}

function segmentalMass(value: unknown): SegmentalLeanMass | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const out: SegmentalLeanMass = {
    leftArm: numOrUndefined(v.leftArm),
    rightArm: numOrUndefined(v.rightArm),
    trunk: numOrUndefined(v.trunk),
    leftLeg: numOrUndefined(v.leftLeg),
    rightLeg: numOrUndefined(v.rightLeg),
  };
  return Object.values(out).some((n) => n != null) ? out : undefined;
}

const ZONE_STATUSES = new Set(['low', 'normal', 'high']);
function zoneStatus(value: unknown): ZoneStatus | undefined {
  return typeof value === 'string' && ZONE_STATUSES.has(value) ? (value as ZoneStatus) : undefined;
}

function segmentalStatus(value: unknown): SegmentalStatus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const out: SegmentalStatus = {
    leftArm: zoneStatus(v.leftArm),
    rightArm: zoneStatus(v.rightArm),
    trunk: zoneStatus(v.trunk),
    leftLeg: zoneStatus(v.leftLeg),
    rightLeg: zoneStatus(v.rightLeg),
  };
  return Object.values(out).some((s) => s != null) ? out : undefined;
}

/**
 * Coerce an already-JSON-parsed model reply into a trustworthy
 * BodyReadingAnalysis, or null when nothing was actually read.
 *
 * The prompt tells the model to null every field and set confidence 0 for a
 * bad photo or a non-report (e.g. an InBody machine's QR/barcode screen
 * instead of its results printout) — that is a legitimate 200 response, not
 * a thrown error, so the caller must check for it explicitly rather than
 * pass it straight through as if real data had been captured. Before this,
 * the raw model JSON went straight to the client with no validation at all
 * (unlike meals' toMealAnalysis) — a malformed field (e.g. a number written
 * with stray units) would still *display* correctly but fail to parse when
 * Save tried to use it, with no visible error either way.
 */
export function toBodyReadingAnalysis(parsed: unknown): BodyReadingAnalysis | null {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const result: BodyReadingAnalysis = {
    deviceLabel: str(p.deviceLabel) || undefined,
    testDate: str(p.testDate) || undefined,
    weightKg: numOrUndefined(p.weightKg),
    bodyFatPercent: numOrUndefined(p.bodyFatPercent),
    skeletalMuscleMassKg: numOrUndefined(p.skeletalMuscleMassKg),
    segmentalLeanMassKg: segmentalMass(p.segmentalLeanMassKg),
    segmentalFatMassKg: segmentalMass(p.segmentalFatMassKg),
    segmentalLeanMassStatus: segmentalStatus(p.segmentalLeanMassStatus),
    segmentalFatMassStatus: segmentalStatus(p.segmentalFatMassStatus),
    confidence: Math.min(1, Math.max(0, num(p.confidence, 0))),
  };
  const hasAnyReading =
    result.weightKg != null ||
    result.bodyFatPercent != null ||
    result.skeletalMuscleMassKg != null ||
    result.segmentalLeanMassKg != null ||
    result.segmentalFatMassKg != null;
  return hasAnyReading ? result : null;
}

// ── Equipment: muscle-id sanitizing ─────────────────────────────────────

/**
 * The client's canonical muscle-id vocabulary (see MUSCLE_ID_RULE in
 * prompts.ts, and MuscleId in the client's src/lib/types.ts) — kept as a
 * plain set here since server and client don't share types.
 */
const MUSCLE_IDS = new Set([
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms',
  'abs', 'obliques', 'lats', 'traps', 'rhomboids', 'lower_back', 'glutes', 'quads',
  'hamstrings', 'adductors', 'hip_flexors', 'calves',
]);

function sanitizeMuscleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && MUSCLE_IDS.has(v));
}

/**
 * Coerce an equipment-analysis reply's muscle arrays to the canonical id
 * vocabulary — drops anything else, which also covers entries cached
 * before this vocabulary existed (localized muscle names) rather than
 * passing them through as if they were valid ids the client's body-map
 * component understands. Every other field (name, steps, cues, mistakes,
 * suggestion, confidence) is left untouched — those are free text the
 * model already localizes correctly.
 */
export function sanitizeEquipmentMuscles<T extends Record<string, unknown>>(
  details: T,
): T & { primaryMuscles: string[]; secondaryMuscles: string[] } {
  return {
    ...details,
    primaryMuscles: sanitizeMuscleIds(details.primaryMuscles),
    secondaryMuscles: sanitizeMuscleIds(details.secondaryMuscles),
  };
}

// ── Coach: a proposed weekly schedule, as a client-executed tool call ──────

export interface CoachScheduleExercise {
  name: string;
  sets: number;
  reps: string;
}

export interface CoachScheduleDay {
  weekday: number;
  title?: string;
  exercises: CoachScheduleExercise[];
}

export interface CoachSchedulePlan {
  summary?: string;
  days: CoachScheduleDay[];
}

/**
 * Validate the coach's `propose_weekly_schedule` tool call before it ever
 * reaches the client. The tool's JSON schema is a strong hint to the model,
 * not a guarantee — a stray string weekday or a runaway set count must not
 * become a broken "Add to my schedule" card.
 *
 * No weight is accepted or invented here: the coach does not know what the
 * user can lift, so a proposed plan carries only sets and reps, the same way
 * a manually-planned day starts with the weight left for the user to fill in.
 */
export function sanitizeSchedulePlan(raw: unknown): CoachSchedulePlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const rawDays = Array.isArray(input.days) ? input.days : [];
  const days: CoachScheduleDay[] = [];
  for (const entry of rawDays.slice(0, 7)) {
    const d = entry as Record<string, unknown>;
    const weekday = Math.round(num(d?.weekday, -1));
    if (weekday < 0 || weekday > 6) continue;
    const rawExercises = Array.isArray(d?.exercises) ? d.exercises : [];
    const exercises: CoachScheduleExercise[] = [];
    for (const ex of rawExercises.slice(0, 12)) {
      const e = ex as Record<string, unknown>;
      const name = str(e?.name).slice(0, 60);
      if (!name) continue;
      exercises.push({
        name,
        sets: Math.min(8, Math.max(1, Math.round(num(e?.sets, 3)))),
        reps: str(e?.reps, '10').slice(0, 12),
      });
    }
    if (exercises.length === 0) continue;
    const title = str(d?.title).slice(0, 40) || undefined;
    // A weekday named twice keeps its last occurrence — what the model said
    // most recently is what it meant.
    const existing = days.findIndex((x) => x.weekday === weekday);
    const day: CoachScheduleDay = { weekday, title, exercises };
    if (existing >= 0) days[existing] = day;
    else days.push(day);
  }
  if (days.length === 0) return undefined;
  days.sort((a, b) => a.weekday - b.weekday);
  return { summary: str(input.summary).slice(0, 200) || undefined, days };
}

// ── AI program: targets + a schedule, as one client-executed tool call ─────

export interface ProgramTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// ── AI program: the food half — named meals per weekday ────────────────────

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface PlannedMealItem {
  name: string;
  portion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PlannedMeal {
  slot: MealSlot;
  name: string;
  items: PlannedMealItem[];
}

export interface MealPlanDay {
  weekday: number;
  meals: PlannedMeal[];
}

export interface MealPlan {
  summary?: string;
  days: MealPlanDay[];
}

/**
 * Validate the meal-plan half of `propose_program`. Same stance as the
 * schedule: the schema is a hint, not a guarantee. Each item's calories are
 * reconciled against its own macros (like toMealAnalysis does for a scanned
 * meal) so a plan can never claim 400 kcal for something whose macros add
 * to 700. A day with no usable meal is dropped; a plan with no usable day
 * is absent — the program still stands on its targets and schedule.
 */
export function sanitizeMealPlan(raw: unknown): MealPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const rawDays = Array.isArray(input.days) ? input.days : [];
  const days: MealPlanDay[] = [];
  for (const entry of rawDays.slice(0, 7)) {
    const d = entry as Record<string, unknown>;
    const weekday = Math.round(num(d?.weekday, -1));
    if (weekday < 0 || weekday > 6) continue;
    const rawMeals = Array.isArray(d?.meals) ? d.meals : [];
    const meals: PlannedMeal[] = [];
    for (const m of rawMeals.slice(0, 6)) {
      const meal = m as Record<string, unknown>;
      const slotRaw = str(meal?.slot).toLowerCase();
      if (!MEAL_SLOTS.includes(slotRaw as MealSlot)) continue;
      const slot = slotRaw as MealSlot;
      const rawItems = Array.isArray(meal?.items) ? meal.items : [];
      const items: PlannedMealItem[] = [];
      for (const it of rawItems.slice(0, 6)) {
        const i = it as Record<string, unknown>;
        const name = str(i?.name).slice(0, 80);
        if (!name) continue;
        const proteinG = Math.max(0, Math.round(num(i?.proteinG, 0)));
        const carbsG = Math.max(0, Math.round(num(i?.carbsG, 0)));
        const fatG = Math.max(0, Math.round(num(i?.fatG, 0)));
        const fromMacros = proteinG * 4 + carbsG * 4 + fatG * 9;
        const stated = Math.max(0, Math.round(num(i?.calories, 0)));
        // Trust the stated figure only when it's in the same neighbourhood
        // as what the macros imply; otherwise the macros win.
        const calories =
          fromMacros > 0 && (stated === 0 || Math.abs(stated - fromMacros) / fromMacros > 0.25)
            ? fromMacros
            : stated;
        items.push({ name, portion: str(i?.portion).slice(0, 40), calories, proteinG, carbsG, fatG });
      }
      if (items.length === 0) continue;
      // One meal per slot per day — the last one named wins.
      const existing = meals.findIndex((x) => x.slot === slot);
      const planned: PlannedMeal = { slot, name: str(meal?.name).slice(0, 80) || items[0].name, items };
      if (existing >= 0) meals[existing] = planned;
      else meals.push(planned);
    }
    if (meals.length === 0) continue;
    meals.sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
    const existingDay = days.findIndex((x) => x.weekday === weekday);
    const day: MealPlanDay = { weekday, meals };
    if (existingDay >= 0) days[existingDay] = day;
    else days.push(day);
  }
  if (days.length === 0) return undefined;
  days.sort((a, b) => a.weekday - b.weekday);
  return { summary: str(input.summary).slice(0, 200) || undefined, days };
}

export interface ProgramPlan {
  summary: string;
  durationWeeks: number;
  targets: ProgramTargets;
  schedule: CoachSchedulePlan;
  /** Absent when the model's meal plan didn't survive validation — the
   * client treats that as "no food plan", never as an error. */
  mealPlan?: MealPlan;
}

/**
 * Validate the `propose_program` tool call the same way sanitizeSchedulePlan
 * validates a plain schedule — the JSON schema is a strong hint to the model,
 * not a guarantee. A program with no usable schedule is not a program, so
 * this returns undefined rather than a half-formed one.
 */
const AISLES = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'spices', 'other'];

export interface RecipeIngredientPlan {
  name: string;
  key: string;
  amount: number;
  unit: 'g' | 'ml';
  state?: 'raw' | 'cooked';
  measure?: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  aisle?: string;
  estimated?: boolean;
}

export interface RecipePlan {
  name: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  cookedYieldG?: number;
  ingredients: RecipeIngredientPlan[];
  steps: string[];
}

/**
 * A recipe is only usable if it can be cooked and counted, so this drops
 * anything that would break either: an ingredient with no weight cannot be
 * scaled or shopped for, and a recipe with fewer than two of them or no steps
 * is not a recipe. Nutrition is clamped rather than rejected — a wrong number
 * the user can correct beats no recipe at all.
 */
export function sanitizeRecipe(raw: unknown): RecipePlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const name = str(input.name).slice(0, 80);
  if (!name) return undefined;

  const rawIngredients = Array.isArray(input.ingredients) ? input.ingredients : [];
  const ingredients: RecipeIngredientPlan[] = [];
  for (const entry of rawIngredients.slice(0, 20)) {
    if (!entry || typeof entry !== 'object') continue;
    const i = entry as Record<string, unknown>;
    const iname = str(i.name).slice(0, 60);
    const amount = num(i.amount, 0);
    // No weight means nothing downstream works: not scaling, not the
    // per-serving macros, not the shopping list.
    if (!iname || amount <= 0) continue;
    // A missing key would split this item off from the same thing in every
    // other recipe, so fall back to a slug of its own name rather than blank.
    const key =
      str(i.key)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || iname.toLowerCase().replace(/\s+/g, '_').slice(0, 40);
    const aisle = str(i.aisle).toLowerCase();
    ingredients.push({
      name: iname,
      key,
      amount: Math.round(amount * 10) / 10,
      unit: str(i.unit) === 'ml' ? 'ml' : 'g',
      state: str(i.state) === 'cooked' ? 'cooked' : 'raw',
      measure: str(i.measure).slice(0, 40) || undefined,
      calories: Math.max(0, Math.round(num(i.calories, 0))),
      proteinG: Math.max(0, Math.round(num(i.proteinG, 0) * 10) / 10),
      carbsG: Math.max(0, Math.round(num(i.carbsG, 0) * 10) / 10),
      fatG: Math.max(0, Math.round(num(i.fatG, 0) * 10) / 10),
      aisle: AISLES.includes(aisle) ? aisle : undefined,
      estimated: i.estimated === true || undefined,
    });
  }
  if (ingredients.length < 2) return undefined;

  const steps = (Array.isArray(input.steps) ? input.steps : [])
    .map((v) => str(v).slice(0, 300))
    .filter(Boolean)
    .slice(0, 15);
  if (steps.length < 2) return undefined;

  const minutes = (v: unknown, max: number): number | undefined => {
    const n = Math.round(num(v, 0));
    return n > 0 && n <= max ? n : undefined;
  };
  const yieldG = Math.round(num(input.cookedYieldG, 0));

  return {
    name,
    servings: Math.min(12, Math.max(1, Math.round(num(input.servings, 2)))),
    prepMinutes: minutes(input.prepMinutes, 240),
    cookMinutes: minutes(input.cookMinutes, 480),
    cookedYieldG: yieldG > 0 && yieldG <= 20000 ? yieldG : undefined,
    ingredients,
    steps,
  };
}

export function sanitizeProgram(raw: unknown): ProgramPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Record<string, unknown>;
  const schedule = sanitizeSchedulePlan(input.schedule);
  if (!schedule) return undefined;
  const t = (input.targets ?? {}) as Record<string, unknown>;
  const calories = Math.max(1200, Math.round(num(t.calories, 2000)));
  const proteinG = Math.max(0, Math.round(num(t.proteinG, 0)));
  const fatG = Math.max(0, Math.round(num(t.fatG, 0)));
  // Carbs are recomputed from calories/protein/fat rather than trusted as
  // written, the same way toMealAnalysis reconciles a meal's own numbers —
  // three independently-estimated macros rarely add up to the stated total.
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  return {
    summary: str(input.summary).slice(0, 400),
    durationWeeks: Math.min(16, Math.max(4, Math.round(num(input.durationWeeks, 8)))),
    targets: { calories, proteinG, carbsG, fatG },
    schedule,
    mealPlan: sanitizeMealPlan(input.mealPlan),
  };
}
