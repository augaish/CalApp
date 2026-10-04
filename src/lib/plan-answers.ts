/**
 * The questions asked before an AI program is built: defaults, and how an
 * answer turns into the numbers the rest of the app uses. Pure — the screens
 * render these and the store saves them.
 */
import type { Goal, PlanAnswers, Profile } from './types';

/** kg a week for a goal and pace — the same table the server writes into the prompt. */
export function paceForAnswers(goal: Goal | undefined, pace: PlanAnswers['pace']): number | undefined {
  if (!goal || goal === 'maintain' || !pace) return goal === 'maintain' ? 0 : undefined;
  const table = goal === 'lose' ? { gentle: 0.25, steady: 0.5, faster: 0.75 } : { gentle: 0.15, steady: 0.25, faster: 0.4 };
  return table[pace];
}

/** The pace chip that matches a saved kg/week, so a profile's pace shows as chosen. */
export function paceFromKg(goal: Goal, kg: number | undefined): PlanAnswers['pace'] {
  if (goal === 'maintain' || kg == null) return 'steady';
  const options = (['gentle', 'steady', 'faster'] as const).map((p) => [p, paceForAnswers(goal, p)!] as const);
  return options.reduce((best, cur) => (Math.abs(cur[1] - kg) < Math.abs(best[1] - kg) ? cur : best))[0];
}

export const includesTraining = (a: Pick<PlanAnswers, 'scope'>) => a.scope !== 'food';
export const includesFood = (a: Pick<PlanAnswers, 'scope'>) => a.scope !== 'training';

/** Training weekdays in the week you have now, Sunday first. */
export function weekdaysOf(schedule: Record<number, { exerciseIds?: string[] } | undefined>): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => (schedule[d]?.exerciseIds?.length ?? 0) > 0);
}

/** Spread n training days over the week, starting Sunday, with rest between where it fits. */
export function spreadDays(n: number): number[] {
  const presets: Record<number, number[]> = {
    1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 2, 4, 6], 5: [0, 1, 3, 4, 6], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  return presets[Math.min(7, Math.max(1, n))];
}

/**
 * Where the questions start: the last answers given, else what the app
 * already knows — the days you train now, and your goal and pace.
 */
export function startingAnswers(
  saved: PlanAnswers | null,
  schedule: Record<number, { exerciseIds?: string[] } | undefined>,
  profile: Profile | null,
): PlanAnswers {
  const now = weekdaysOf(schedule);
  const goal = profile?.goal ?? saved?.goal ?? 'maintain';
  const weekdays = saved?.weekdays?.length ? saved.weekdays : now.length >= 2 && now.length <= 6 ? now : spreadDays(4);
  return {
    scope: saved?.scope ?? 'both',
    days: weekdays.length,
    weekdays,
    sessionMinutes: saved?.sessionMinutes ?? 60,
    place: saved?.place ?? 'gym',
    experience: saved?.experience ?? 'intermediate',
    injuries: saved?.injuries,
    mealsPerDay: saved?.mealsPerDay ?? '3+snack',
    eatingStyle: saved?.eatingStyle ?? 'any',
    allergies: saved?.allergies ?? [],
    allergyOther: saved?.allergyOther,
    dislikes: saved?.dislikes,
    cooking: saved?.cooking ?? 'mix',
    goal,
    pace: profile ? paceFromKg(goal, profile.paceKgPerWeek) : (saved?.pace ?? 'steady'),
  };
}

/**
 * Change how many days a week: keep the chosen weekdays that still fit and
 * fill the rest from an even spread, so the picked days never disagree with
 * the count.
 */
export function withDayCount(a: PlanAnswers, n: number): PlanAnswers {
  const current = a.weekdays ?? [];
  let weekdays = current.slice(0, n);
  for (const d of spreadDays(n)) if (weekdays.length < n && !weekdays.includes(d)) weekdays.push(d);
  for (let d = 0; weekdays.length < n && d < 7; d++) if (!weekdays.includes(d)) weekdays.push(d);
  weekdays = weekdays.sort((x, y) => x - y);
  return { ...a, days: n, weekdays };
}

/** Tap a weekday: on or off, and the count follows. At least one stays on. */
export function toggleWeekday(a: PlanAnswers, d: number): PlanAnswers {
  const current = a.weekdays ?? [];
  const weekdays = current.includes(d) ? current.filter((x) => x !== d) : [...current, d].sort((x, y) => x - y);
  if (weekdays.length === 0 || weekdays.length > 6) return a;
  return { ...a, weekdays, days: weekdays.length };
}
