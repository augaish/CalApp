/**
 * The answers a person gives before a program is built, and the rules that
 * hold a program to them whatever the model wrote.
 *
 * The prompt asks for the right days and no allergens, but a prompt is a
 * request. These checks are what make "only the days you picked" and "never
 * your allergies" true: training lands on the chosen weekdays (moved there in
 * order when the model picked others), and a planned meal that names an
 * allergen — or meat, for a vegetarian — is sent back to be replaced, and
 * dropped if it comes back wrong again.
 */
import { allergensIn, ALLERGEN_IDS, mentions, otherTerms } from './allergens.js';
import type { CoachScheduleDay, MealPlan, MealPlanDay, ProgramPlan } from './parse.js';

export type PlanScope = 'training' | 'food' | 'both';

export interface PlanAnswers {
  scope: PlanScope;
  /** True when they skipped the questions: build from their data, as before. */
  skipped?: boolean;
  // Training
  days?: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  sessionMinutes?: number;
  place?: 'gym' | 'home' | 'both';
  experience?: 'beginner' | 'intermediate' | 'advanced';
  injuries?: string;
  // Food
  mealsPerDay?: '2' | '3' | '3+snack';
  eatingStyle?: 'any' | 'high_protein' | 'vegetarian' | 'low_carb';
  allergies?: string[];
  allergyOther?: string;
  dislikes?: string;
  cooking?: 'home' | 'out' | 'mix';
  // Goal
  goal?: 'lose' | 'maintain' | 'gain';
  pace?: 'gentle' | 'steady' | 'faster';
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
  return s || undefined;
};

/** Whatever the app sent, as answers we can put in a prompt. */
export function sanitizeAnswers(raw: unknown): PlanAnswers | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;
  const scope = oneOf(a.scope, ['training', 'food', 'both'] as const) ?? 'both';
  const weekdays = Array.isArray(a.weekdays)
    ? [...new Set(a.weekdays.map((d) => Math.round(Number(d))).filter((d) => d >= 0 && d <= 6))].sort((x, y) => x - y)
    : undefined;
  const days = Number.isFinite(Number(a.days)) ? Math.min(6, Math.max(1, Math.round(Number(a.days)))) : undefined;
  const minutes = Number(a.sessionMinutes);
  const allergies = Array.isArray(a.allergies)
    ? [...new Set(a.allergies.filter((x): x is string => typeof x === 'string' && (ALLERGEN_IDS as string[]).includes(x)))]
    : undefined;
  return {
    scope,
    skipped: a.skipped === true || undefined,
    days: weekdays && weekdays.length > 0 ? weekdays.length : days,
    weekdays: weekdays && weekdays.length > 0 ? weekdays : undefined,
    sessionMinutes: Number.isFinite(minutes) && minutes >= 15 && minutes <= 180 ? Math.round(minutes) : undefined,
    place: oneOf(a.place, ['gym', 'home', 'both'] as const),
    experience: oneOf(a.experience, ['beginner', 'intermediate', 'advanced'] as const),
    injuries: text(a.injuries, 200),
    mealsPerDay: oneOf(a.mealsPerDay, ['2', '3', '3+snack'] as const),
    eatingStyle: oneOf(a.eatingStyle, ['any', 'high_protein', 'vegetarian', 'low_carb'] as const),
    allergies: allergies && allergies.length > 0 ? allergies : undefined,
    allergyOther: text(a.allergyOther, 120),
    dislikes: text(a.dislikes, 200),
    cooking: oneOf(a.cooking, ['home', 'out', 'mix'] as const),
    goal: oneOf(a.goal, ['lose', 'maintain', 'gain'] as const),
    pace: oneOf(a.pace, ['gentle', 'steady', 'faster'] as const),
  };
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** kg a week for a goal and pace — the same figures the app's own pace picker offers. */
export function paceKg(goal: PlanAnswers['goal'], pace: PlanAnswers['pace']): number | undefined {
  if (!goal || goal === 'maintain' || !pace) return undefined;
  const table = goal === 'lose' ? { gentle: 0.25, steady: 0.5, faster: 0.75 } : { gentle: 0.15, steady: 0.25, faster: 0.4 };
  return table[pace];
}

const includesTraining = (a: PlanAnswers) => a.scope !== 'food';
const includesFood = (a: PlanAnswers) => a.scope !== 'training';

/** The answers as plain lines for the prompt — the person's own words, labelled. */
export function answersText(a: PlanAnswers): string {
  const lines: string[] = [];
  lines.push(`Plan: ${a.scope === 'both' ? 'training and food' : `${a.scope} only`}`);
  if (a.goal) {
    const kg = paceKg(a.goal, a.pace);
    lines.push(`Goal: ${a.goal}${kg ? ` at about ${kg} kg a week (${a.pace} pace)` : ''}`);
  }
  if (includesTraining(a)) {
    if (a.weekdays) lines.push(`Training days: exactly ${a.weekdays.length} — ${a.weekdays.map((d) => `${WEEKDAY_NAMES[d]} (${d})`).join(', ')}`);
    else if (a.days) lines.push(`Training days: ${a.days} a week`);
    if (a.sessionMinutes) lines.push(`Session length: about ${a.sessionMinutes} minutes`);
    if (a.place) lines.push(`Trains at: ${a.place === 'both' ? 'gym and home' : a.place}${a.place === 'home' ? ' (assume little equipment: bodyweight, dumbbells, bands)' : ''}`);
    if (a.experience) lines.push(`Experience: ${a.experience}`);
    if (a.injuries) lines.push(`Injuries or limits (their words): ${a.injuries}`);
  }
  if (includesFood(a)) {
    if (a.mealsPerDay) lines.push(`Meals a day: ${a.mealsPerDay === '3+snack' ? '3 meals and 1 snack' : a.mealsPerDay}`);
    if (a.eatingStyle && a.eatingStyle !== 'any') lines.push(`Eating style: ${a.eatingStyle.replace('_', ' ')}`);
    const allergies = [...(a.allergies ?? []), ...otherTerms(a.allergyOther)];
    if (allergies.length > 0) lines.push(`ALLERGIES (never include, not even as an ingredient): ${allergies.join(', ')}`);
    if (a.dislikes) lines.push(`Dislikes (avoid): ${a.dislikes}`);
    if (a.cooking) lines.push(`Mostly: ${a.cooking === 'home' ? 'cooks at home' : a.cooking === 'out' ? 'eats out — pick dishes easy to order' : 'a mix of cooking and eating out'}`);
  }
  return lines.join('\n');
}

/** The rules part of the prompt: what this person asked for, stated as hard limits. */
export function answersRules(a: PlanAnswers): string {
  const rules: string[] = [];
  if (includesTraining(a)) {
    if (a.weekdays) rules.push(`Put training ONLY on these weekdays: ${a.weekdays.join(', ')} (0 = Sunday). Exactly one training day for each of them; every other day is rest.`);
    else if (a.days) rules.push(`Exactly ${a.days} training days.`);
    if (a.sessionMinutes) rules.push(`Fit each day in about ${a.sessionMinutes} minutes: roughly ${Math.max(3, Math.min(8, Math.round(a.sessionMinutes / 11)))} exercises.`);
    if (a.injuries) rules.push('Work around the injuries they listed: leave out exercises that load that area.');
  }
  if (includesFood(a)) {
    if (a.mealsPerDay === '2') rules.push('Two meals a day (no snack).');
    if (a.mealsPerDay === '3') rules.push('Breakfast, lunch and dinner — no snack.');
    if (a.mealsPerDay === '3+snack') rules.push('Breakfast, lunch, dinner and one snack every day.');
    if (a.eatingStyle === 'vegetarian') rules.push('Vegetarian: no meat, chicken or fish anywhere.');
    if ((a.allergies?.length ?? 0) > 0 || a.allergyOther) rules.push('Never use an allergen, and never name a dish that usually contains one.');
  }
  return rules.map((r) => `- ${r}`).join('\n');
}

/** Food groups a meal must not name, for these answers. */
function banned(a: PlanAnswers): { groups: string[]; other?: string } {
  const groups = [...(a.allergies ?? [])];
  if (a.eatingStyle === 'vegetarian') groups.push('meat', 'seafood');
  return { groups: [...new Set(groups)], other: a.allergyOther };
}

export interface MealViolation {
  weekday: number;
  slot: string;
  name: string;
  hits: string[];
}

/** Every planned meal that names something these answers rule out. */
export function mealViolations(plan: MealPlan | undefined, a: PlanAnswers): MealViolation[] {
  if (!plan) return [];
  const { groups, other } = banned(a);
  if (groups.length === 0 && !other) return [];
  const out: MealViolation[] = [];
  for (const day of plan.days) {
    for (const meal of day.meals) {
      const text = [meal.name, ...meal.items.map((i) => i.name)].join(' · ');
      const hits = [
        ...allergensIn(text, groups.filter((g) => g !== 'meat'), other),
        ...(groups.includes('meat') && mentions(text, 'meat') ? ['meat'] : []),
      ];
      if (hits.length > 0) out.push({ weekday: day.weekday, slot: meal.slot, name: meal.name, hits: [...new Set(hits)] });
    }
  }
  return out;
}

/** What to tell the model when it has to fix meals. */
export function violationsRequest(v: MealViolation[]): string {
  return `These planned meals break the person's rules and must be replaced with different dishes that hit the same calories and macros:\n${v
    .map((x) => `- ${WEEKDAY_NAMES[x.weekday]} ${x.slot}: "${x.name}" contains ${x.hits.join(', ')}`)
    .join('\n')}\nChange nothing else.`;
}

/** Drop any meal that still breaks the rules; a day left empty goes too. */
export function stripViolations(plan: MealPlan | undefined, a: PlanAnswers): MealPlan | undefined {
  if (!plan) return plan;
  const bad = mealViolations(plan, a);
  if (bad.length === 0) return plan;
  const isBad = (wd: number, slot: string) => bad.some((b) => b.weekday === wd && b.slot === slot);
  const days: MealPlanDay[] = plan.days
    .map((d) => ({ ...d, meals: d.meals.filter((m) => !isBad(d.weekday, m.slot)) }))
    .filter((d) => d.meals.length > 0);
  return days.length > 0 ? { ...plan, days } : undefined;
}

/**
 * Training only on the chosen weekdays. A day already on one stays; a day the
 * model put elsewhere moves, in order, to the first chosen weekday still free;
 * anything beyond the number of chosen days is dropped. Without chosen
 * weekdays, a day count still caps the week.
 */
export function fitToWeekdays(days: CoachScheduleDay[], a: PlanAnswers): CoachScheduleDay[] {
  if (a.weekdays && a.weekdays.length > 0) {
    const chosen = a.weekdays;
    const kept = days.filter((d) => chosen.includes(d.weekday));
    const free = chosen.filter((wd) => !kept.some((d) => d.weekday === wd));
    const moved = days
      .filter((d) => !chosen.includes(d.weekday))
      .slice(0, free.length)
      .map((d, i) => ({ ...d, weekday: free[i] }));
    return [...kept, ...moved].sort((x, y) => x.weekday - y.weekday);
  }
  if (a.days) return days.slice(0, a.days);
  return days;
}

/**
 * Hold a program to the answers: only what was asked for (no meal plan on a
 * training-only plan, no schedule on a food-only one), training on the chosen
 * days. Allergens are checked separately, because fixing them takes a call.
 */
export function fitProgram(p: ProgramPlan, a: PlanAnswers): ProgramPlan {
  const out: ProgramPlan = { ...p };
  if (a.scope === 'food') delete out.schedule;
  else if (out.schedule) out.schedule = { ...out.schedule, days: fitToWeekdays(out.schedule.days, a) };
  if (a.scope === 'training') delete out.mealPlan;
  return out;
}
