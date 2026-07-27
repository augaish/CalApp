import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dailyTargets } from './tdee';
import type {
  DailyTargets,
  Exercise,
  FoodItem,
  Language,
  LoggedMeal,
  LoggedWorkout,
  MealType,
  PlannedSet,
  Profile,
  WeightEntry,
  WorkoutSet,
} from './types';

export interface WaterEntry {
  at: string;
  ml: number;
}

export interface Account {
  name: string;
  email?: string;
  provider: 'google' | 'guest';
}

interface AppState {
  account: Account | null;
  language: Language | null;
  profile: Profile | null;
  targets: DailyTargets | null;
  meals: LoggedMeal[];
  /** User-made & scan-saved exercises (built-ins live in code, not here). */
  exercises: Exercise[];
  /**
   * Recurring weekly plan: weekday (0=Sun … 6=Sat) → exercises for that day,
   * plus optional planned target sets per exercise (`plans`).
   */
  schedule: Record<
    number,
    { title?: string; exerciseIds: string[]; plans?: Record<string, PlannedSet[]> }
  >;
  workouts: LoggedWorkout[];
  water: WaterEntry[];
  weights: WeightEntry[];
  remindMeals: boolean;
  remindWater: boolean;
  remindWorkouts: boolean;
  /** Reminders have been auto-scheduled once (permission requested on first run). */
  remindersInitialized: boolean;
  /** First-run welcome carousel has been seen. */
  tutorialSeen: boolean;
  /** User dismissed the Getting-started checklist on Overview. */
  checklistDismissed: boolean;
  /** Spotlight coach-mark tour has been seen/skipped. */
  tourSeen: boolean;
  hydrated: boolean;

  setAccount: (account: Account | null) => void;
  signOut: () => void;
  setLanguage: (language: Language) => void;
  setProfile: (profile: Profile) => void;
  /** Manually override the daily calorie/macro targets. */
  setTargets: (targets: DailyTargets) => void;
  logMeal: (items: FoodItem[], photoUri?: string, mealType?: MealType, at?: string) => void;
  removeMeal: (id: string) => void;
  /** Edit a logged meal in place (items, meal type, and/or date-time). */
  updateMeal: (
    id: string,
    patch: { items?: FoodItem[]; mealType?: MealType; at?: string },
  ) => void;
  /** Copy a logged meal to a target day (ISO) and optional meal type. */
  duplicateMeal: (id: string, at: string, mealType?: MealType) => void;
  /** Adds a custom/scan exercise to the library; returns its new id. */
  addExercise: (input: Omit<Exercise, 'id' | 'source'> & { source?: Exercise['source'] }) => string;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  removeExercise: (id: string) => void;
  /** Append a set to the (exercise, day) workout, creating it if needed. */
  logSet: (
    exercise: { id: string; name: string; type: LoggedWorkout['type'] },
    set: WorkoutSet,
    at?: string,
  ) => void;
  updateSet: (workoutId: string, index: number, patch: Partial<WorkoutSet>) => void;
  removeSet: (workoutId: string, index: number) => void;
  removeWorkout: (id: string) => void;
  /** Clone the most recent previous training day's exercises/sets onto `day`. */
  repeatLastSession: (day: Date) => number;
  addToSchedule: (weekday: number, exerciseId: string) => void;
  removeFromSchedule: (weekday: number, exerciseId: string) => void;
  setScheduleTitle: (weekday: number, title: string) => void;
  /** Set (or clear, with []) the planned target sets for a scheduled exercise. */
  setPlannedSets: (weekday: number, exerciseId: string, sets: PlannedSet[]) => void;
  /** Replace the weekly plan with a shared one, recreating custom exercises. */
  importSchedule: (payload: {
    schedule: Record<
      number,
      { title?: string; exerciseIds: string[]; plans?: Record<string, PlannedSet[]> }
    >;
    exercises: Exercise[];
  }) => void;
  /**
   * Mark a planned exercise done for `day` (checkbox on): clones its last
   * session's sets when available, otherwise records a single empty "done"
   * set. No-op if it's already logged that day.
   */
  markExerciseDone: (
    exercise: { id: string; name: string; type: LoggedWorkout['type'] },
    day: Date,
  ) => void;
  logWater: (ml: number, at?: string) => void;
  logWeight: (kg: number, at?: string) => void;
  setRemindMeals: (on: boolean) => void;
  setRemindWater: (on: boolean) => void;
  setRemindWorkouts: (on: boolean) => void;
  setRemindersInitialized: () => void;
  setTutorialSeen: () => void;
  dismissChecklist: () => void;
  setTourSeen: () => void;
  /** Re-arm the coach-mark tour (from Profile → Replay tour). */
  replayTour: () => void;
  setHydrated: () => void;
  /** Wipes all local data and returns to the login/onboarding flow. */
  resetAll: () => void;
}

/** Default meal type from the hour of day. */
export function mealTypeForNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 22) return 'dinner';
  return 'snack';
}

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      account: null,
      language: null,
      profile: null,
      targets: null,
      meals: [],
      exercises: [],
      schedule: {},
      workouts: [],
      water: [],
      weights: [],
      remindMeals: true,
      remindWater: true,
      remindWorkouts: true,
      remindersInitialized: false,
      tutorialSeen: false,
      checklistDismissed: false,
      tourSeen: false,
      hydrated: false,

      setAccount: (account) => set({ account }),
      signOut: () => set({ account: null }),
      setLanguage: (language) => set({ language }),
      setProfile: (profile) => set({ profile, targets: dailyTargets(profile) }),
      setTargets: (targets) => set({ targets }),
      logMeal: (items, photoUri, mealType, at) =>
        set((s) => ({
          meals: [
            {
              id: id(),
              at: at ?? new Date().toISOString(),
              items,
              photoUri,
              mealType: mealType ?? mealTypeForNow(),
            },
            ...s.meals,
          ],
        })),
      removeMeal: (mealId) => set((s) => ({ meals: s.meals.filter((m) => m.id !== mealId) })),
      updateMeal: (mealId, patch) =>
        set((s) => ({
          meals: s.meals.map((m) =>
            m.id === mealId
              ? {
                  ...m,
                  ...(patch.items ? { items: patch.items } : {}),
                  ...(patch.mealType ? { mealType: patch.mealType } : {}),
                  ...(patch.at ? { at: patch.at } : {}),
                }
              : m,
          ),
        })),
      duplicateMeal: (mealId, at, mealType) =>
        set((s) => {
          const src = s.meals.find((m) => m.id === mealId);
          if (!src) return {};
          return {
            meals: [
              {
                id: id(),
                at,
                items: src.items.map((i) => ({ ...i })),
                photoUri: src.photoUri,
                mealType: mealType ?? src.mealType ?? mealTypeForNow(),
              },
              ...s.meals,
            ],
          };
        }),
      addExercise: (input) => {
        const exId = `custom:${id()}`;
        set((s) => ({
          exercises: [{ ...input, id: exId, source: input.source ?? 'custom' }, ...s.exercises],
        }));
        return exId;
      },
      updateExercise: (exId, patch) =>
        set((s) => ({
          exercises: s.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)),
        })),
      removeExercise: (exId) =>
        set((s) => ({ exercises: s.exercises.filter((e) => e.id !== exId) })),
      logSet: (exercise, newSet, at) =>
        set((s) => {
          const when = at ?? new Date().toISOString();
          const bodyKg = s.profile?.weightKg ?? 75;
          const existing = s.workouts.find(
            (w) => w.exerciseId === exercise.id && isSameDay(w.at, new Date(when)),
          );
          const stamped: WorkoutSet = { ...newSet, isPR: false };
          if (existing) {
            const sets = [...existing.sets, stamped];
            const withPR = markPRs(sets, exercise.type);
            return {
              workouts: s.workouts.map((w) =>
                w.id === existing.id
                  ? { ...w, sets: withPR, caloriesBurned: workoutBurn(withPR.length, bodyKg) }
                  : w,
              ),
            };
          }
          const sets = markPRs([stamped], exercise.type);
          return {
            workouts: [
              {
                id: id(),
                at: when,
                exerciseId: exercise.id,
                exerciseName: exercise.name,
                type: exercise.type,
                sets,
                caloriesBurned: workoutBurn(sets.length, bodyKg),
              },
              ...s.workouts,
            ],
          };
        }),
      updateSet: (workoutId, index, patch) =>
        set((s) => ({
          workouts: s.workouts.map((w) => {
            if (w.id !== workoutId) return w;
            const sets = w.sets.map((st, i) => (i === index ? { ...st, ...patch } : st));
            return { ...w, sets: markPRs(sets, w.type) };
          }),
        })),
      removeSet: (workoutId, index) =>
        set((s) => {
          const bodyKg = s.profile?.weightKg ?? 75;
          const workouts: LoggedWorkout[] = [];
          for (const w of s.workouts) {
            if (w.id !== workoutId) {
              workouts.push(w);
              continue;
            }
            const sets = w.sets.filter((_, i) => i !== index);
            if (sets.length === 0) continue; // drop the empty workout
            workouts.push({
              ...w,
              sets: markPRs(sets, w.type),
              caloriesBurned: workoutBurn(sets.length, bodyKg),
            });
          }
          return { workouts };
        }),
      removeWorkout: (workoutId) =>
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== workoutId) })),
      repeatLastSession: (day) => {
        const state = get();
        // Most recent day strictly before `day` that has any workout.
        const prior = state.workouts
          .filter((w) => new Date(w.at).getTime() < startOfDay(day).getTime())
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        if (prior.length === 0) return 0;
        const lastKey = dayKey(new Date(prior[0].at));
        const source = prior.filter((w) => dayKey(new Date(w.at)) === lastKey);
        const bodyKg = state.profile?.weightKg ?? 75;
        const stamp = stampFor(day);
        const cloned: LoggedWorkout[] = source.map((w) => {
          const sets = w.sets.map((st) => ({ ...st, done: false, isPR: false }));
          return {
            id: id(),
            at: stamp,
            exerciseId: w.exerciseId,
            exerciseName: w.exerciseName,
            type: w.type,
            sets,
            caloriesBurned: workoutBurn(sets.length, bodyKg),
          };
        });
        set((s) => ({ workouts: [...cloned, ...s.workouts] }));
        return cloned.length;
      },
      addToSchedule: (weekday, exerciseId) =>
        set((s) => {
          const cur = s.schedule[weekday] ?? { exerciseIds: [] };
          if (cur.exerciseIds.includes(exerciseId)) return {};
          return {
            schedule: {
              ...s.schedule,
              [weekday]: { ...cur, exerciseIds: [...cur.exerciseIds, exerciseId] },
            },
          };
        }),
      removeFromSchedule: (weekday, exerciseId) =>
        set((s) => {
          const cur = s.schedule[weekday];
          if (!cur) return {};
          const plans = { ...(cur.plans ?? {}) };
          delete plans[exerciseId];
          return {
            schedule: {
              ...s.schedule,
              [weekday]: {
                ...cur,
                exerciseIds: cur.exerciseIds.filter((x) => x !== exerciseId),
                plans,
              },
            },
          };
        }),
      setPlannedSets: (weekday, exerciseId, sets) =>
        set((s) => {
          const cur = s.schedule[weekday] ?? { exerciseIds: [] };
          const plans = { ...(cur.plans ?? {}) };
          if (sets.length === 0) delete plans[exerciseId];
          else plans[exerciseId] = sets;
          return { schedule: { ...s.schedule, [weekday]: { ...cur, plans } } };
        }),
      setScheduleTitle: (weekday, title) =>
        set((s) => {
          const cur = s.schedule[weekday] ?? { exerciseIds: [] };
          return { schedule: { ...s.schedule, [weekday]: { ...cur, title: title.trim() || undefined } } };
        }),
      importSchedule: (payload) =>
        set((s) => {
          // Recreate any non-built-in exercises the plan references that this
          // device doesn't already have (matched by id).
          const have = new Set(s.exercises.map((e) => e.id));
          const incoming = (payload.exercises ?? []).filter(
            (e) => e.source !== 'builtin' && !have.has(e.id),
          );
          return {
            exercises: [...s.exercises, ...incoming],
            schedule: payload.schedule ?? {},
          };
        }),
      markExerciseDone: (exercise, day) => {
        const state = get();
        if (state.workouts.some((w) => w.exerciseId === exercise.id && isSameDay(w.at, day))) {
          return; // already logged that day
        }
        // Most recent earlier session for this exercise — by id first, then by
        // name (so a matching record under a different entry still counts).
        const byDate = (a: LoggedWorkout, b: LoggedWorkout) =>
          new Date(b.at).getTime() - new Date(a.at).getTime();
        const norm = (v: string) => v.trim().toLowerCase();
        const prior = state.workouts.filter((w) => !isSameDay(w.at, day)).sort(byDate);
        const src =
          prior.find((w) => w.exerciseId === exercise.id) ??
          prior.find((w) => norm(w.exerciseName) === norm(exercise.name));
        const bodyKg = state.profile?.weightKg ?? 75;
        // Prefer the sets planned for this weekday (the plan IS the actual —
        // checking logs exactly what you planned, editable afterwards); else
        // clone the last session; else a single empty done set.
        const planned = state.schedule[day.getDay()]?.plans?.[exercise.id];
        const base: WorkoutSet[] =
          planned && planned.length > 0
            ? planned.map((p) => ({ ...p, done: true, isPR: false }))
            : src
              ? src.sets.map((st) => ({ ...st, done: true, isPR: false }))
              : [{ done: true }];
        const sets = markPRs(base, exercise.type);
        set((s) => ({
          workouts: [
            {
              id: id(),
              at: stampFor(day),
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              type: exercise.type,
              sets,
              caloriesBurned: workoutBurn(sets.length, bodyKg),
            },
            ...s.workouts,
          ],
        }));
      },
      logWater: (ml, at) =>
        set((s) => ({ water: [{ at: at ?? new Date().toISOString(), ml }, ...s.water] })),
      logWeight: (kg, at) =>
        set((s) => ({ weights: [{ at: at ?? new Date().toISOString(), kg }, ...s.weights] })),
      setRemindMeals: (on) => set({ remindMeals: on }),
      setRemindWater: (on) => set({ remindWater: on }),
      setRemindWorkouts: (on) => set({ remindWorkouts: on }),
      setRemindersInitialized: () => set({ remindersInitialized: true }),
      setTutorialSeen: () => set({ tutorialSeen: true }),
      dismissChecklist: () => set({ checklistDismissed: true }),
      setTourSeen: () => set({ tourSeen: true }),
      replayTour: () => set({ tourSeen: false }),
      setHydrated: () => set({ hydrated: true }),
      resetAll: () =>
        set({
          account: null,
          language: null,
          profile: null,
          targets: null,
          meals: [],
          exercises: [],
          schedule: {},
          workouts: [],
          water: [],
          weights: [],
          remindMeals: true,
          remindWater: true,
          remindWorkouts: true,
          remindersInitialized: false,
          tutorialSeen: false,
          checklistDismissed: false,
          tourSeen: false,
        }),
    }),
    {
      name: 'calapp-store',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: migrateStore,
      partialize: ({
        account,
        language,
        profile,
        targets,
        meals,
        exercises,
        schedule,
        workouts,
        water,
        weights,
        remindMeals,
        remindWater,
        remindWorkouts,
        remindersInitialized,
        tutorialSeen,
        checklistDismissed,
        tourSeen,
      }) => ({
        account,
        language,
        profile,
        targets,
        meals,
        exercises,
        schedule,
        workouts,
        water,
        weights,
        remindMeals,
        remindWater,
        remindWorkouts,
        remindersInitialized,
        tutorialSeen,
        checklistDismissed,
        tourSeen,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/**
 * v0/v1 → v2: the old flat workout shape
 * `{ equipmentName, sets:number, reps:string, weightLiftedKg }` becomes a
 * per-set LoggedWorkout, and each distinct name gets a custom Exercise so it
 * still appears in the library. Nobody loses history.
 */
function migrateStore(persisted: unknown, version: number): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const state = persisted as Record<string, unknown>;
  if (version >= 2) return state;

  const oldWorkouts = Array.isArray(state.workouts) ? state.workouts : [];
  const exercises: Exercise[] = Array.isArray(state.exercises)
    ? (state.exercises as Exercise[])
    : [];
  const nameToId = new Map<string, string>();
  for (const e of exercises) nameToId.set(e.name, e.id);

  const workouts: LoggedWorkout[] = oldWorkouts.map((raw) => {
    const w = raw as Record<string, unknown>;
    if (Array.isArray(w.sets)) return raw as LoggedWorkout; // already migrated
    const name = (w.equipmentName as string) || 'Exercise';
    let exId = nameToId.get(name);
    if (!exId) {
      exId = `custom:${id()}`;
      nameToId.set(name, exId);
      exercises.push({ id: exId, name, category: 'fullBody', type: 'weight_reps', source: 'custom' });
    }
    const count = typeof w.sets === 'number' && w.sets > 0 ? (w.sets as number) : 1;
    const reps = w.reps ? parseInt(String(w.reps), 10) || undefined : undefined;
    const weightKg = typeof w.weightLiftedKg === 'number' ? (w.weightLiftedKg as number) : undefined;
    const sets: WorkoutSet[] = Array.from({ length: count }, () => ({
      weightKg,
      reps,
      done: true,
      isPR: false,
    }));
    return {
      id: (w.id as string) ?? id(),
      at: (w.at as string) ?? new Date().toISOString(),
      exerciseId: exId,
      exerciseName: name,
      type: 'weight_reps',
      sets,
      caloriesBurned: typeof w.caloriesBurned === 'number' ? (w.caloriesBurned as number) : undefined,
    };
  });

  return { ...state, exercises, workouts };
}

export function isSameDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

export function isToday(iso: string): boolean {
  return isSameDay(iso, new Date());
}

export function mealCalories(meal: LoggedMeal): number {
  return meal.items.reduce((sum, i) => sum + i.calories, 0);
}

export interface DayTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function totalsForDay(meals: LoggedMeal[], day: Date): DayTotals {
  const totals: DayTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const meal of meals) {
    if (!isSameDay(meal.at, day)) continue;
    for (const item of meal.items) {
      totals.calories += item.calories;
      totals.proteinG += item.proteinG;
      totals.carbsG += item.carbsG;
      totals.fatG += item.fatG;
    }
  }
  return totals;
}

export function waterForDay(entries: WaterEntry[], day: Date): number {
  return entries.reduce((sum, e) => (isSameDay(e.at, day) ? sum + e.ml : sum), 0);
}

/** Recommended daily water in ml (~35 ml per kg body weight, rounded to 10). */
export function waterTargetMl(weightKg: number): number {
  return Math.round((weightKg * 35) / 10) * 10;
}

/**
 * Rough strength-training burn: MET 5.0 for ~2 minutes (work + rest) per set →
 * kcal = MET × 3.5 × kg / 200 × minutes. Replaced by real data once a wearable
 * is connected.
 */
export function workoutBurn(setCount: number, bodyKg: number): number {
  if (setCount <= 0) return 0;
  return Math.round(((5 * 3.5 * bodyKg) / 200) * 2 * setCount);
}

export function burnedForDay(workouts: LoggedWorkout[], day: Date): number {
  return workouts.reduce(
    (sum, w) => (isSameDay(w.at, day) ? sum + (w.caloriesBurned ?? 0) : sum),
    0,
  );
}

function startOfDay(day: Date): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Selected day stamped with the current clock time (mirrors day.timestampFor). */
function stampFor(day: Date): string {
  const now = new Date();
  if (isSameDay(now.toISOString(), day)) return now.toISOString();
  const d = new Date(day);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return d.toISOString();
}

/**
 * Comparable load of a set for PR detection. For lifts the trophy goes to the
 * heaviest set (weight ranks first, reps only break ties) — that's what users
 * expect. Bodyweight → reps, time → duration, cardio → distance.
 */
function setScore(s: WorkoutSet, type: LoggedWorkout['type']): number {
  if (type === 'bodyweight_reps') return s.reps ?? 0;
  if (type === 'time') return s.seconds ?? 0;
  if (type === 'distance_time') return s.distanceM ?? 0;
  return (s.weightKg ?? 0) * 1000 + (s.reps ?? 0);
}

/** Index of the best set in a session (highest score; first wins ties), or -1. */
export function bestSetIndex(sets: WorkoutSet[], type: LoggedWorkout['type']): number {
  let bestIdx = -1;
  let best = 0;
  sets.forEach((s, i) => {
    const score = setScore(s, type);
    if (score > best) {
      best = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/** Flags the single best set in a session as the PR (highest score, first wins ties). */
function markPRs(sets: WorkoutSet[], type: LoggedWorkout['type']): WorkoutSet[] {
  const bestIdx = bestSetIndex(sets, type);
  return sets.map((s, i) => ({ ...s, isPR: i === bestIdx }));
}

/** Best set score for an exercise across all sessions before `day` (for PR badges). */
export function bestScoreBefore(
  workouts: LoggedWorkout[],
  exerciseId: string,
  day: Date,
): number {
  let best = 0;
  for (const w of workouts) {
    if (w.exerciseId !== exerciseId) continue;
    if (startOfDay(new Date(w.at)).getTime() >= startOfDay(day).getTime()) continue;
    for (const s of w.sets) best = Math.max(best, setScore(s, w.type));
  }
  return best;
}

/** All sessions of an exercise, newest first. */
export function historyFor(workouts: LoggedWorkout[], exerciseId: string): LoggedWorkout[] {
  return workouts
    .filter((w) => w.exerciseId === exerciseId)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** The (exercise, day) workout if it exists. */
export function workoutFor(
  workouts: LoggedWorkout[],
  exerciseId: string,
  day: Date,
): LoggedWorkout | undefined {
  return workouts.find((w) => w.exerciseId === exerciseId && isSameDay(w.at, day));
}

/** Consecutive days (ending today) with at least one logged meal. */
export function streakDays(meals: LoggedMeal[]): number {
  let streak = 0;
  const day = new Date();
  for (;;) {
    if (meals.some((m) => isSameDay(m.at, day))) {
      streak += 1;
      day.setDate(day.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/** Consecutive days (ending today) with at least one logged workout. */
export function workoutStreakDays(workouts: LoggedWorkout[]): number {
  let streak = 0;
  const day = new Date();
  for (;;) {
    if (workouts.some((w) => isSameDay(w.at, day))) {
      streak += 1;
      day.setDate(day.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/** Meal types already logged on `day`. */
export function mealTypesLogged(meals: LoggedMeal[], day: Date): Set<MealType> {
  const set = new Set<MealType>();
  for (const m of meals) {
    if (isSameDay(m.at, day)) set.add(m.mealType ?? 'snack');
  }
  return set;
}
