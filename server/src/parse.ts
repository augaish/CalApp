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

export interface ProgramPlan {
  summary: string;
  durationWeeks: number;
  targets: ProgramTargets;
  schedule: CoachSchedulePlan;
}

/**
 * Validate the `propose_program` tool call the same way sanitizeSchedulePlan
 * validates a plain schedule — the JSON schema is a strong hint to the model,
 * not a guarantee. A program with no usable schedule is not a program, so
 * this returns undefined rather than a half-formed one.
 */
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
  };
}
