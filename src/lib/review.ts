import type { DailyTargets, Goal, LoggedMeal, LoggedWorkout, WeightEntry } from './types';

/**
 * What actually happened over a stretch of days, and what to do about it.
 *
 * Built from records only. The hardest part is not the arithmetic — it is
 * refusing to average over days that were never logged. "You averaged
 * 1,400 kcal" is a lie when three of the seven days are blank, and acting on
 * it would tell someone to eat more when they simply forgot to write things
 * down. Every figure here says how many days it is actually based on.
 */

export interface DaySummary {
  dateKey: string;
  /** Null when nothing at all was logged — NOT zero. */
  calories: number | null;
  proteinG: number | null;
  /** Exercises completed that day. */
  setsDone: number;
  trained: boolean;
}

export interface WeeklyReview {
  days: DaySummary[];
  daysInRange: number;
  /** Days with at least one meal logged. Everything food-related averages
   * over THIS, never over daysInRange. */
  daysLogged: number;
  daysTrained: number;
  /** Null when nothing was logged at all — there is no honest average. */
  avgCalories: number | null;
  avgProteinG: number | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  /** Weight at the start and end of the range, when both exist. */
  weightStartKg: number | null;
  weightEndKg: number | null;
  weightDeltaKg: number | null;
  /** How complete the picture is, as a fraction of the range. */
  coverage: number;
}

/** Local y-m-d key, matching store.dateKey exactly (zero-based month). */
function key(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

function sameDay(iso: string, day: Date): boolean {
  return key(new Date(iso)) === key(day);
}

export function buildWeeklyReview(
  days: Date[],
  meals: LoggedMeal[],
  workouts: LoggedWorkout[],
  weights: WeightEntry[],
  targets: DailyTargets | null,
): WeeklyReview {
  const summaries: DaySummary[] = days.map((day) => {
    const dayMeals = meals.filter((m) => sameDay(m.at, day));
    const dayWorkouts = workouts.filter((w) => sameDay(w.at, day));
    const setsDone = dayWorkouts.reduce((n, w) => n + w.sets.filter((s) => s.done).length, 0);
    // A day with no meals is unknown, not zero — the distinction is the whole
    // point of this file.
    const logged = dayMeals.length > 0;
    return {
      dateKey: key(day),
      calories: logged ? dayMeals.reduce((n, m) => n + m.items.reduce((x, i) => x + i.calories, 0), 0) : null,
      proteinG: logged ? dayMeals.reduce((n, m) => n + m.items.reduce((x, i) => x + i.proteinG, 0), 0) : null,
      setsDone,
      trained: setsDone > 0,
    };
  });

  const loggedDays = summaries.filter((d) => d.calories != null);
  const avg = (pick: (d: DaySummary) => number | null): number | null =>
    loggedDays.length === 0
      ? null
      : loggedDays.reduce((n, d) => n + (pick(d) ?? 0), 0) / loggedDays.length;

  // Weight readings inside the range, oldest first.
  const inRange = weights
    .filter((w) => days.some((day) => sameDay(w.at, day)))
    .sort((a, b) => a.at.localeCompare(b.at));
  const weightStartKg = inRange[0]?.kg ?? null;
  const weightEndKg = inRange.length > 1 ? inRange[inRange.length - 1].kg : null;

  return {
    days: summaries,
    daysInRange: days.length,
    daysLogged: loggedDays.length,
    daysTrained: summaries.filter((d) => d.trained).length,
    avgCalories: avg((d) => d.calories),
    avgProteinG: avg((d) => d.proteinG),
    targetCalories: targets?.calories ?? null,
    targetProteinG: targets?.proteinG ?? null,
    weightStartKg,
    weightEndKg,
    weightDeltaKg: weightStartKg != null && weightEndKg != null ? weightEndKg - weightStartKg : null,
    coverage: days.length === 0 ? 0 : loggedDays.length / days.length,
  };
}

export type SuggestionKind =
  | 'logMore'
  | 'proteinLow'
  | 'caloriesOver'
  | 'caloriesUnder'
  | 'trainMore'
  | 'onTrack';

export interface Suggestion {
  kind: SuggestionKind;
  /** Values for the copy. */
  values?: Record<string, number>;
  /** A concrete change to accept, when there is one. */
  apply?: { targetCalories: number };
}

/**
 * What to change, from the records.
 *
 * Deliberately conservative and deliberately local — no AI call, nothing to
 * pay for, and every suggestion traceable to a number on the screen above it.
 *
 * The first rule outranks all the others: below half coverage, the only
 * honest advice is "log more days". Recommending a calorie change from three
 * days out of seven would be advice built on a gap.
 */
export function reviewSuggestions(review: WeeklyReview, goal: Goal | undefined): Suggestion[] {
  const out: Suggestion[] = [];
  if (review.daysLogged === 0) return [{ kind: 'logMore', values: { logged: 0, total: review.daysInRange } }];
  if (review.coverage < 0.5) {
    return [{ kind: 'logMore', values: { logged: review.daysLogged, total: review.daysInRange } }];
  }

  const { avgCalories, targetCalories, avgProteinG, targetProteinG } = review;

  // Calories: only worth mentioning past a margin wider than the estimate's
  // own error, and only suggest a target change when the SCALE agrees that
  // something is off — an average alone cannot tell you whether the target
  // was wrong or the week was.
  if (avgCalories != null && targetCalories) {
    const diff = avgCalories - targetCalories;
    const off = Math.abs(diff) / targetCalories;
    if (off > 0.12) {
      const wrongWay =
        review.weightDeltaKg != null &&
        ((goal === 'lose' && review.weightDeltaKg > 0.2) || (goal === 'gain' && review.weightDeltaKg < -0.2));
      const apply = wrongWay
        ? { targetCalories: Math.round((targetCalories + (goal === 'lose' ? -150 : 150)) / 10) * 10 }
        : undefined;
      out.push({
        kind: diff > 0 ? 'caloriesOver' : 'caloriesUnder',
        values: { avg: Math.round(avgCalories), target: targetCalories, diff: Math.round(Math.abs(diff)) },
        apply,
      });
    }
  }

  if (avgProteinG != null && targetProteinG && avgProteinG < targetProteinG * 0.85) {
    out.push({
      kind: 'proteinLow',
      values: { avg: Math.round(avgProteinG), target: Math.round(targetProteinG) },
    });
  }

  if (review.daysTrained < 2) {
    out.push({ kind: 'trainMore', values: { trained: review.daysTrained } });
  }

  if (out.length === 0) out.push({ kind: 'onTrack' });
  return out;
}
