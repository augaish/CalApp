import { findExercise } from '../exercises';
import { pendingOccurrences, resolvePlan } from '../occurrences';
import { gateOpen, readOnly, type GateState } from '../plan-gates';
import {
  actualBurnedForDay,
  bestScoreBefore,
  dateKey,
  isSameDay,
  setScore,
  streakDays,
  totalsForDay,
  waterForDay,
  waterTargetMl,
  weightTrend,
  workoutStreakDays,
  type AppState,
} from '../store';
import type { LoggedMeal, LoggedWorkout, WeightEntry } from '../types';
import {
  DEFAULT_PREFS,
  type BodyWin,
  type DayFacts,
  type MealSlot,
  type NotifyFacts,
  type NotifyPrefs,
  type WeekFacts,
} from './planner';

/**
 * The planner's facts, read from the app's own data: today's and tomorrow's
 * numbers, the person's usual times learned from their logs, what their plan
 * covers, and the week behind the next Saturday recap.
 */

const DAY_MS = 86_400_000;
/** How far back usual times are learned from. */
const LEARN_DAYS = 28;
/** Logs of a meal needed before its time counts as learned. */
const LEARN_MIN = 4;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function minutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** The slot a meal counts as: its own type, or the time it was logged. */
export function slotOf(meal: LoggedMeal): MealSlot | null {
  if (meal.mealType === 'breakfast' || meal.mealType === 'lunch' || meal.mealType === 'dinner') return meal.mealType;
  if (meal.mealType === 'snack') return null;
  const m = minutesOf(meal.at);
  if (m >= 5 * 60 && m < 11 * 60) return 'breakfast';
  if (m >= 11 * 60 && m < 16 * 60 + 30) return 'lunch';
  if (m >= 16 * 60 + 30 && m < 23 * 60 + 30) return 'dinner';
  return null;
}

/**
 * When someone usually has each meal, from the last four weeks: the median
 * logged time once there are enough logs; 'never' for a meal they skip
 * although they log others most days; null (use the default) otherwise.
 */
export function learnMealTimes(meals: LoggedMeal[], now: Date): Record<MealSlot, number | null | 'never'> {
  const since = now.getTime() - LEARN_DAYS * DAY_MS;
  const recent = meals.filter((m) => new Date(m.at).getTime() >= since);
  const days = new Set(recent.map((m) => dateKey(new Date(m.at)))).size;
  const out = {} as Record<MealSlot, number | null | 'never'>;
  for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlot[]) {
    const times = recent.filter((m) => slotOf(m) === slot).map((m) => minutesOf(m.at));
    if (times.length >= LEARN_MIN) out[slot] = median(times);
    else if (days >= 10 && times.length <= 1) out[slot] = 'never';
    else out[slot] = null;
  }
  return out;
}

/** When someone usually trains: the median start of their sessions, once there are a few. */
export function learnTrainingTime(workouts: LoggedWorkout[], now: Date): number | null {
  const since = now.getTime() - LEARN_DAYS * DAY_MS;
  const firstByDay = new Map<string, number>();
  for (const w of workouts) {
    if (new Date(w.at).getTime() < since) continue;
    const k = dateKey(new Date(w.at));
    const m = minutesOf(w.at);
    if (!firstByDay.has(k) || m < (firstByDay.get(k) as number)) firstByDay.set(k, m);
  }
  const starts = [...firstByDay.values()];
  return starts.length >= 3 ? median(starts) : null;
}

/** Their usual glass: the most common amount they log. */
export function usualGlass(water: { ml: number }[]): number {
  const counts = new Map<number, number>();
  for (const w of water.slice(0, 40)) counts.set(w.ml, (counts.get(w.ml) ?? 0) + 1);
  let best = 250;
  let most = 0;
  for (const [ml, n] of counts) if (n > most && ml >= 100 && ml <= 1000) { best = ml; most = n; }
  return best;
}

/** A protein-rich food they eat often, to suggest by name. */
export function proteinFood(meals: LoggedMeal[], now: Date): { name: string; proteinG: number } | null {
  const since = now.getTime() - LEARN_DAYS * DAY_MS;
  const seen = new Map<string, { name: string; proteinG: number; n: number }>();
  for (const m of meals) {
    if (new Date(m.at).getTime() < since) continue;
    for (const i of m.items) {
      if (!(i.proteinG >= 20)) continue;
      const k = i.name.trim().toLowerCase();
      const cur = seen.get(k);
      seen.set(k, { name: i.name.trim(), proteinG: i.proteinG, n: (cur?.n ?? 0) + 1 });
    }
  }
  const best = [...seen.values()].sort((a, b) => b.n - a.n || b.proteinG - a.proteinG)[0];
  return best && best.n >= 2 ? { name: best.name, proteinG: best.proteinG } : null;
}

/** New personal records set on a day: a done set beating every earlier day's best. */
export function prsOn(workouts: LoggedWorkout[], day: Date): number {
  let prs = 0;
  const seen = new Set<string>();
  for (const w of workouts) {
    if (!isSameDay(w.at, day) || seen.has(w.exerciseId)) continue;
    const before = bestScoreBefore(workouts, w.exerciseId, day);
    if (before <= 0) continue;
    const todayBest = workouts
      .filter((x) => x.exerciseId === w.exerciseId && isSameDay(x.at, day))
      .flatMap((x) => x.sets.filter((s) => s.done).map((s) => setScore(s, x.type)))
      .reduce((a, b) => Math.max(a, b), 0);
    if (todayBest > before) {
      prs++;
      seen.add(w.exerciseId);
    }
  }
  return prs;
}

/**
 * Body changes worth celebrating from a reading taken on `day`, against the
 * reading before it: weight toward the goal, less fat, more muscle.
 */
export function bodyWinsOn(weights: WeightEntry[], day: Date, goal: 'lose' | 'maintain' | 'gain'): BodyWin[] {
  const sorted = [...weights].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const idx = sorted.findIndex((w) => isSameDay(w.at, day));
  if (idx < 0 || idx === sorted.length - 1) return [];
  const cur = sorted[idx];
  const prev = sorted[idx + 1];
  const wins: BodyWin[] = [];
  const dw = cur.kg - prev.kg;
  if (Math.abs(dw) >= 0.2 && weightTrend(dw, goal) === 'good') wins.push({ kind: 'weight', delta: Math.round(dw * 10) / 10 });
  const prevFat = sorted.slice(idx + 1).find((w) => w.bodyFatPercent != null)?.bodyFatPercent;
  if (cur.bodyFatPercent != null && prevFat != null && prevFat - cur.bodyFatPercent >= 0.3) {
    wins.push({ kind: 'fat', delta: Math.round((cur.bodyFatPercent - prevFat) * 10) / 10 });
  }
  const prevMuscle = sorted.slice(idx + 1).find((w) => w.skeletalMuscleMassKg != null)?.skeletalMuscleMassKg;
  if (cur.skeletalMuscleMassKg != null && prevMuscle != null && cur.skeletalMuscleMassKg - prevMuscle >= 0.2) {
    wins.push({ kind: 'muscle', delta: Math.round((cur.skeletalMuscleMassKg - prevMuscle) * 10) / 10 });
  }
  return wins;
}

type State = Pick<
  AppState,
  | 'meals' | 'water' | 'workouts' | 'weights' | 'schedule' | 'occurrences' | 'skips' | 'exercises' | 'targets' | 'profile'
  | 'activeFast' | 'activeProgram' | 'whoopBurnByDay' | 'whoopWorkoutsByDay' | 'remindMeals' | 'remindWater' | 'remindWorkouts'
> & { notifyPrefs?: Partial<NotifyPrefs> };

function dayFacts(s: State, date: Date, now: Date): DayFacts {
  const meals = Array.isArray(s.meals) ? s.meals : [];
  const workouts = Array.isArray(s.workouts) ? s.workouts : [];
  const water = Array.isArray(s.water) ? s.water : [];
  const dayMeals = meals.filter((m) => isSameDay(m.at, date));
  const totals = totalsForDay(meals, date);
  const plan = resolvePlan(s.schedule ?? {}, s.occurrences ?? {}, date);
  const skipped = (s.skips ?? {})[dateKey(date)] ?? [];
  const planIds = plan ? plan.day.exerciseIds.filter((id) => !skipped.includes(id)) : [];
  const dayWorkouts = workouts.filter((w) => isSameDay(w.at, date) && w.sets.some((x) => x.done));
  const trained = dayWorkouts.length > 0;
  let lead: { name: string; weightKg?: number; reps?: number } | undefined;
  if (planIds.length > 0) {
    const ex = findExercise(planIds[0], s.exercises ?? []);
    const last = workouts
      .filter((w) => w.exerciseId === planIds[0] && new Date(w.at).getTime() < startOfDay(date).getTime())
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
    const best = last?.sets.filter((x) => x.done).sort((a, b) => setScore(b, last.type) - setScore(a, last.type))[0];
    lead = { name: ex?.name ?? last?.exerciseName ?? '', weightKg: best?.weightKg, reps: best?.reps };
    if (!lead.name) lead = undefined;
  }
  const yesterday = new Date(date.getTime() - DAY_MS);
  const missed = pendingOccurrences(s.schedule ?? {}, s.occurrences ?? {}, workouts, s.skips ?? {}, date, 1).find(
    (p) => p.scheduledDate === dateKey(yesterday),
  );
  const lastSet = dayWorkouts.map((w) => new Date(w.updatedAt ?? w.at)).sort((a, b) => b.getTime() - a.getTime())[0];
  const waterSince = lastSet ? water.filter((w) => new Date(w.at).getTime() > lastSet.getTime()).reduce((a, w) => a + w.ml, 0) : 0;

  let program: DayFacts['program'] = null;
  if (s.activeProgram) {
    const elapsed = Math.floor((startOfDay(date).getTime() - startOfDay(new Date(s.activeProgram.createdAt)).getTime()) / DAY_MS);
    const total = s.activeProgram.durationWeeks * 7;
    if (elapsed > 0 && elapsed < total && elapsed % 7 === 0) program = { weekStarting: elapsed / 7 + 1, total: s.activeProgram.durationWeeks };
    else if (elapsed === total) program = { finished: true, total: s.activeProgram.durationWeeks };
  }

  return {
    date: startOfDay(date),
    kcal: totals.calories,
    protein: totals.proteinG,
    waterMl: waterForDay(water, date),
    mealsLogged: [...new Set(dayMeals.map(slotOf).filter((x): x is MealSlot => !!x))],
    mealMinutes: dayMeals.map((m) => minutesOf(m.at)),
    loggedAnything: dayMeals.length > 0 || trained || waterForDay(water, date) > 0 || (s.weights ?? []).some((w) => isSameDay(w.at, date)),
    plan: planIds.length > 0 ? { title: plan?.day.title ?? null, exercises: planIds.length, lead } : null,
    trained,
    missedYesterday: missed ? { title: missed.day.title ?? null } : null,
    workoutEndMinute: lastSet && isSameDay(lastSet.toISOString(), now) ? lastSet.getHours() * 60 + lastSet.getMinutes() : null,
    waterSinceWorkoutMl: waterSince,
    prs: prsOn(workouts, date),
    burnedKcal: actualBurnedForDay(workouts, s.whoopBurnByDay ?? {}, s.whoopWorkoutsByDay ?? {}, date),
    bodyWins: s.profile ? bodyWinsOn(s.weights ?? [], date, s.profile.goal) : [],
    program,
  };
}

/** The seven days before `recapDay` (Saturday), for the weekly recap. */
export function weekFacts(s: State, recapDay: Date): WeekFacts {
  const meals = Array.isArray(s.meals) ? s.meals : [];
  const workouts = Array.isArray(s.workouts) ? s.workouts : [];
  const water = Array.isArray(s.water) ? s.water : [];
  const proteinTarget = s.targets?.proteinG ?? 0;
  const waterTarget = s.profile ? waterTargetMl(s.profile.weightKg) : 0;
  let activeDays = 0, workoutsDone = 0, workoutsPlanned = 0, prs = 0, proteinGoalDays = 0, waterGoalDays = 0, loggedFoodDays = 0, kcalSum = 0;
  for (let i = 7; i >= 1; i--) {
    const d = startOfDay(new Date(recapDay.getTime() - i * DAY_MS));
    const t = totalsForDay(meals, d);
    const hasFood = meals.some((m) => isSameDay(m.at, d));
    const trained = workouts.some((w) => isSameDay(w.at, d) && w.sets.some((x) => x.done));
    const ml = waterForDay(water, d);
    if (hasFood || trained || ml > 0) activeDays++;
    if (hasFood) {
      loggedFoodDays++;
      kcalSum += t.calories;
      if (proteinTarget > 0 && t.proteinG >= proteinTarget) proteinGoalDays++;
    }
    if (waterTarget > 0 && ml >= waterTarget) waterGoalDays++;
    if (resolvePlan(s.schedule ?? {}, s.occurrences ?? {}, d)) workoutsPlanned++;
    if (trained) workoutsDone++;
    prs += prsOn(workouts, d);
  }
  const from = recapDay.getTime() - 7 * DAY_MS;
  const inWeek = (s.weights ?? [])
    .filter((w) => new Date(w.at).getTime() >= from - DAY_MS && new Date(w.at).getTime() < recapDay.getTime())
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const change = inWeek.length >= 2 ? Math.round((inWeek[inWeek.length - 1].kg - inWeek[0].kg) * 10) / 10 : null;
  return {
    activeDays,
    workoutsDone,
    workoutsPlanned,
    prs,
    proteinGoalDays,
    waterGoalDays,
    loggedFoodDays,
    avgKcal: loggedFoodDays ? Math.round(kcalSum / loggedFoodDays) : 0,
    weightChangeKg: change,
    weightTowardGoal: change != null && !!s.profile && weightTrend(change, s.profile.goal) === 'good',
  };
}

/** The saved preferences over the defaults; the three switches are the stored reminder flags. */
export function prefsOf(s: State): NotifyPrefs {
  const p = s.notifyPrefs ?? {};
  return {
    ...DEFAULT_PREFS,
    ...p,
    food: s.remindMeals,
    water: s.remindWater,
    training: s.remindWorkouts,
  };
}

/** Everything the planner needs, as of `now`. */
export function buildFacts(s: State, gate: GateState, now: Date = new Date()): NotifyFacts {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const days: [DayFacts, DayFacts] = [dayFacts(s, today, now), dayFacts(s, tomorrow, now)];
  const saturday = [today, tomorrow].find((d) => d.getDay() === 6) ?? null;
  const noPlan = readOnly(gate);
  const meals = Array.isArray(s.meals) ? s.meals : [];
  const workouts = Array.isArray(s.workouts) ? s.workouts : [];
  const fastEnd = s.activeFast ? new Date(new Date(s.activeFast.startedAt).getTime() + s.activeFast.targetHours * 3_600_000) : null;
  const learned = learnMealTimes(meals, now);
  return {
    now,
    prefs: prefsOf(s),
    scope: {
      food: !noPlan && gateOpen('food', gate),
      training: !noPlan && gateOpen('training', gate),
      health: !noPlan && gateOpen('health', gate),
    },
    targets: {
      kcal: s.targets?.calories ?? 0,
      protein: s.targets?.proteinG ?? 0,
      waterMl: s.profile ? waterTargetMl(s.profile.weightKg) : 0,
    },
    usual: { ...learned, training: learnTrainingTime(workouts, now) },
    glassMl: usualGlass(Array.isArray(s.water) ? s.water : []),
    proteinFood: proteinFood(meals, now),
    fastEndsAt: fastEnd,
    hasSchedule: Object.values(s.schedule ?? {}).some((d) => (d?.exerciseIds?.length ?? 0) > 0),
    logStreak: streakDays(meals),
    workoutStreak: workoutStreakDays(workouts),
    days,
    week: saturday ? weekFacts(s, saturday) : null,
  };
}
