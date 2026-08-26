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
  Program,
  WeightEntry,
  WhoopDayWorkout,
  WorkoutSet,
} from './types';

export interface WaterEntry {
  at: string;
  ml: number;
}

export interface Account {
  name: string;
  email?: string;
  provider: 'google' | 'apple' | 'email' | 'guest';
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
  /** Plan exercises skipped on a specific date (dateKey → exerciseIds). The
   * weekly schedule is untouched, so a skipped exercise returns next week. */
  skips: Record<string, string[]>;
  /**
   * Stable per-install id used to meter AI usage and resolve the plan on the
   * server. Generated on first launch; superseded by the auth user id later.
   */
  installId: string | null;
  /**
   * Account id this install has already been handed over to. Set once the
   * server accepts the claim, so it is not re-attempted on every launch.
   */
  linkedRef: string | null;
  /** When this device last agreed with the account's stored copy. */
  syncedAt: string | null;
  /**
   * Per-date ordering override (dateKey → exerciseIds). A date with no entry
   * follows its weekday's plan, so editing the weekly schedule still moves
   * today around until the day itself has been reordered by hand.
   */
  dayOrder: Record<string, string[]>;
  /**
   * A day's real burn straight from a connected WHOOP, keyed like `dayOrder`.
   * Calgym has no whole-session concept (exercises are checked off one at a
   * time), so this stands in for the whole day's `burnedForDay` total rather
   * than trying to attribute WHOOP's number to one exercise.
   */
  whoopBurnByDay: Record<string, number>;
  /** The individual WHOOP workouts a day's `whoopBurnByDay` total is made of. */
  whoopWorkoutsByDay: Record<string, WhoopDayWorkout[]>;
  /** When the one-time history backfill last actually found data — null means try again on next visit. */
  whoopBackfilledAt: string | null;
  workouts: LoggedWorkout[];
  water: WaterEntry[];
  weights: WeightEntry[];
  /** The one AI-designed program currently in effect, if the user has accepted one. */
  activeProgram: Program | null;
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
  updateSet: (workoutId: string, index: number, patch: Partial<WorkoutSet>, at?: string) => void;
  removeSet: (workoutId: string, index: number) => void;
  removeWorkout: (id: string) => void;
  /**
   * Toggle whether a logged workout counts as trained. Unchecking keeps the
   * sets/record but marks them not-done and zeroes the burned calories;
   * re-checking marks them done and restores the burn.
   */
  setWorkoutTrained: (workoutId: string, trained: boolean) => void;
  /**
   * Clone one day's exercises and sets onto another day, skipping anything
   * already logged there. Returns how many were added.
   */
  copyDayTo: (sourceDay: Date, targetDay: Date) => number;
  /** Reorder one date only, leaving the weekly plan alone. */
  setDayOrder: (day: Date, exerciseIds: string[]) => void;
  /** Reorder a weekday's plan — every later occurrence of it follows suit. */
  reorderSchedule: (weekday: number, exerciseIds: string[]) => void;
  /**
   * Turn a day that was actually trained into a weekday of the weekly
   * schedule, carrying its sets across as the targets. 'replace' makes the
   * weekday exactly this day; 'merge' keeps what is already there but lets
   * today's numbers win for any exercise in both. Returns how many were saved.
   */
  saveDayToSchedule: (day: Date, weekday: number, mode: 'replace' | 'merge') => number;
  addToSchedule: (weekday: number, exerciseId: string) => void;
  removeFromSchedule: (weekday: number, exerciseId: string) => void;
  setScheduleTitle: (weekday: number, title: string) => void;
  /** Set (or clear, with []) the planned target sets for a scheduled exercise. */
  setPlannedSets: (weekday: number, exerciseId: string, sets: PlannedSet[]) => void;
  /** Hide a plan exercise for one day only (kept in the weekly schedule). */
  skipPlanToday: (day: Date, exerciseId: string) => void;
  /** Undo a same-day skip. */
  restorePlanToday: (day: Date, exerciseId: string) => void;
  /** Replace the weekly plan with a shared one, recreating custom exercises. */
  importSchedule: (payload: {
    schedule: Record<
      number,
      { title?: string; exerciseIds: string[]; plans?: Record<string, PlannedSet[]> }
    >;
    exercises: Exercise[];
  }) => void;
  /**
   * Add a coach-proposed plan: new custom exercises for anything not already
   * in the library, and each named weekday replaced with exactly what was
   * proposed. Every weekday the plan doesn't mention is left alone — unlike
   * `importSchedule`, this is a partial plan, not a whole shared week.
   */
  applyCoachSchedule: (input: {
    newExercises: Exercise[];
    days: {
      weekday: number;
      title?: string;
      exerciseIds: string[];
      plans: Record<string, PlannedSet[]>;
    }[];
  }) => void;
  /**
   * Mark a planned exercise done for `day` (checkbox on): clones its last
   * session's sets when available, otherwise records a single empty "done"
   * set. No-op if it's already logged that day.
   */
  markExerciseDone: (
    exercise: { id: string; name: string; type: LoggedWorkout['type'] },
    day: Date,
    /** false seeds the record but leaves it not-trained (no burn). */
    trained?: boolean,
  ) => void;
  /** Set (or, with null, clear) WHOOP's real burn for a day — see whoopBurnByDay. */
  setWhoopDayBurn: (day: Date, kcal: number | null) => void;
  /** Set (or, with [], clear) the individual WHOOP workouts a day is made of. */
  setWhoopDayWorkouts: (day: Date, workouts: WhoopDayWorkout[]) => void;
  setWhoopBackfilledAt: (iso: string | null) => void;
  logWater: (ml: number, at?: string) => void;
  logWeight: (kg: number, at?: string) => void;
  /** A fuller reading (manual or scanned) — same log as logWeight, with the
   * optional body-fat/segmental fields a quick Overview weigh-in never sets. */
  logBodyReading: (entry: Omit<WeightEntry, 'at'> & { at?: string }) => void;
  /** Accept, replace, or end (pass null) the active AI-designed program.
   * Committing its targets/schedule is a separate step (setTargets /
   * applyCoachSchedule) so a program is just data here, same as any other
   * proposal the coach hands the UI to act on. */
  setActiveProgram: (program: Program | null) => void;
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
  /** Create the install id on first launch; returns the existing one after. */
  ensureInstallId: () => string;
  /** Remember that this install has been claimed by the given account id. */
  setLinkedRef: (ref: string) => void;
  setSyncedAt: (iso: string | null) => void;
  /** Replace every synced log with the account's copy (cloud restore). */
  applySnapshot: (snap: {
    profile: Profile | null;
    targets: DailyTargets | null;
    meals: LoggedMeal[];
    exercises: Exercise[];
    schedule: AppState['schedule'];
    skips: Record<string, string[]>;
    dayOrder: Record<string, string[]>;
    workouts: LoggedWorkout[];
    water: WaterEntry[];
    weights: WeightEntry[];
    activeProgram: Program | null;
  }) => void;
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
      skips: {},
      installId: null,
      linkedRef: null,
      syncedAt: null,
      dayOrder: {},
      whoopBurnByDay: {},
      whoopWorkoutsByDay: {},
      whoopBackfilledAt: null,
      workouts: [],
      water: [],
      weights: [],
      activeProgram: null,
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
                  ? { ...w, sets: withPR, updatedAt: when, caloriesBurned: burnForSets(withPR, bodyKg) }
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
                updatedAt: when,
                exerciseId: exercise.id,
                exerciseName: exercise.name,
                type: exercise.type,
                sets,
                caloriesBurned: burnForSets(sets, bodyKg),
              },
              ...s.workouts,
            ],
          };
        }),
      updateSet: (workoutId, index, patch, at) =>
        set((s) => ({
          workouts: s.workouts.map((w) => {
            if (w.id !== workoutId) return w;
            const sets = w.sets.map((st, i) => (i === index ? { ...st, ...patch } : st));
            return { ...w, sets: markPRs(sets, w.type), updatedAt: at ?? w.updatedAt };
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
              caloriesBurned: burnForSets(sets, bodyKg),
            });
          }
          return { workouts };
        }),
      removeWorkout: (workoutId) =>
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== workoutId) })),
      setWorkoutTrained: (workoutId, trained) =>
        set((s) => {
          const bodyKg = s.profile?.weightKg ?? 75;
          return {
            workouts: s.workouts.map((w) => {
              if (w.id !== workoutId) return w;
              const sets = w.sets.map((st) => ({ ...st, done: trained }));
              return {
                ...w,
                sets,
                caloriesBurned: burnForSets(sets, bodyKg),
              };
            }),
          };
        }),
      copyDayTo: (sourceDay, targetDay) => {
        const state = get();
        const srcKey = dayKey(sourceDay);
        const onSource = state.workouts.filter((w) => dayKey(new Date(w.at)) === srcKey);
        if (onSource.length === 0) return 0;
        // Clone in the order the source day is displayed in, so a day that was
        // reordered by hand arrives looking the same.
        const sourceOrder = applyOrder(
          onSource.map((w) => w.exerciseId),
          state.dayOrder[dateKey(sourceDay)],
        );
        const source = sourceOrder
          .map((id) => onSource.find((w) => w.exerciseId === id))
          .filter((w): w is LoggedWorkout => !!w);
        // An exercise already logged on the target day is left alone, so
        // copying twice cannot double-count it.
        const targetKey = dayKey(targetDay);
        const already = new Set(
          state.workouts
            .filter((w) => dayKey(new Date(w.at)) === targetKey)
            .map((w) => w.exerciseId),
        );
        const stamp = stampFor(targetDay);
        const cloned: LoggedWorkout[] = source
          .filter((w) => !already.has(w.exerciseId))
          .map((w) => ({
            id: id(),
            at: stamp,
            exerciseId: w.exerciseId,
            exerciseName: w.exerciseName,
            type: w.type,
            // Copied as a target, not a claim: the weights to aim for, with
            // nothing marked done — and so nothing burned — until it is
            // ticked off. Checking it on recomputes the burn.
            sets: w.sets.map((st) => ({ ...st, done: false, isPR: false })),
            caloriesBurned: 0,
          }));
        if (cloned.length === 0) return 0;
        set((s) => ({ workouts: [...cloned, ...s.workouts] }));
        return cloned.length;
      },
      saveDayToSchedule: (day, weekday, mode) => {
        const state = get();
        const dk = dayKey(day);
        const onDay = state.workouts.filter((w) => dayKey(new Date(w.at)) === dk);
        if (onDay.length === 0) return 0;
        // The weekday inherits the order the day is actually displayed in.
        const logged = applyOrder(
          onDay.map((w) => w.exerciseId),
          state.dayOrder[dateKey(day)],
        )
          .map((id) => onDay.find((w) => w.exerciseId === id))
          .filter((w): w is LoggedWorkout => !!w);

        const current = state.schedule[weekday];
        const ids = mode === 'replace' ? [] : [...(current?.exerciseIds ?? [])];
        const plans: Record<string, PlannedSet[]> =
          mode === 'replace' ? {} : { ...(current?.plans ?? {}) };

        for (const w of logged) {
          if (!ids.includes(w.exerciseId)) ids.push(w.exerciseId);
          // What was just trained is the better target, so it overwrites any
          // existing plan for that exercise even when merging.
          plans[w.exerciseId] = w.sets.map((s) => ({
            weightKg: s.weightKg,
            reps: s.reps,
            seconds: s.seconds,
            distanceM: s.distanceM,
          }));
        }

        set((s) => ({
          schedule: {
            ...s.schedule,
            // The day's name belongs to the weekday, not to the workout, so it
            // survives a replace.
            [weekday]: { title: current?.title, exerciseIds: ids, plans },
          },
        }));
        return logged.length;
      },
      setDayOrder: (day, exerciseIds) =>
        set((s) => ({ dayOrder: { ...s.dayOrder, [dateKey(day)]: exerciseIds } })),
      setWhoopDayBurn: (day, kcal) =>
        set((s) => {
          const key = dateKey(day);
          if (kcal == null) {
            const { [key]: _, ...rest } = s.whoopBurnByDay;
            return { whoopBurnByDay: rest };
          }
          return { whoopBurnByDay: { ...s.whoopBurnByDay, [key]: kcal } };
        }),
      setWhoopDayWorkouts: (day, workouts) =>
        set((s) => {
          const key = dateKey(day);
          if (workouts.length === 0) {
            const { [key]: _, ...rest } = s.whoopWorkoutsByDay;
            return { whoopWorkoutsByDay: rest };
          }
          return { whoopWorkoutsByDay: { ...s.whoopWorkoutsByDay, [key]: workouts } };
        }),
      setWhoopBackfilledAt: (iso) => set({ whoopBackfilledAt: iso }),
      reorderSchedule: (weekday, exerciseIds) =>
        set((s) => {
          const cur = s.schedule[weekday];
          if (!cur) return {};
          // Only reshuffle what is actually on that day; never let a stale list
          // add or drop exercises.
          const kept = exerciseIds.filter((id) => cur.exerciseIds.includes(id));
          const missing = cur.exerciseIds.filter((id) => !kept.includes(id));
          return {
            schedule: { ...s.schedule, [weekday]: { ...cur, exerciseIds: [...kept, ...missing] } },
          };
        }),
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
      skipPlanToday: (day, exerciseId) =>
        set((s) => {
          const key = dateKey(day);
          const cur = s.skips[key] ?? [];
          if (cur.includes(exerciseId)) return {};
          return { skips: { ...s.skips, [key]: [...cur, exerciseId] } };
        }),
      restorePlanToday: (day, exerciseId) =>
        set((s) => {
          const key = dateKey(day);
          const cur = s.skips[key];
          if (!cur) return {};
          const next = cur.filter((x) => x !== exerciseId);
          const skips = { ...s.skips };
          if (next.length === 0) delete skips[key];
          else skips[key] = next;
          return { skips };
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
      applyCoachSchedule: ({ newExercises, days }) =>
        set((s) => ({
          exercises: [...s.exercises, ...newExercises],
          schedule: days.reduce(
            (acc, d) => ({
              ...acc,
              [d.weekday]: { title: d.title, exerciseIds: d.exerciseIds, plans: d.plans },
            }),
            s.schedule,
          ),
        })),
      markExerciseDone: (exercise, day, trained = true) => {
        const state = get();
        if (state.workouts.some((w) => w.exerciseId === exercise.id && isSameDay(w.at, day))) {
          return; // already logged that day
        }
        // The last time you did this exercise — matched by id first, then by
        // name. Strictly earlier days only: filtering on "not this day" also
        // swept in later sessions, so checking off a day you had missed seeded
        // it from a workout you had not done yet.
        const norm = (v: string) => v.trim().toLowerCase();
        const dayStart = startOfDay(day).getTime();
        const priors = state.workouts.filter(
          (w) =>
            new Date(w.at).getTime() < dayStart &&
            (w.exerciseId === exercise.id || norm(w.exerciseName) === norm(exercise.name)),
        );
        // Most recent, not heaviest. Seeding from the best session ever meant
        // ticking an exercise off filled in a personal best from weeks ago —
        // both the wrong weights and the wrong number of sets — which reads as
        // numbers invented out of nowhere rather than as your last session. The
        // record to beat is still shown next to the exercise as "Max".
        const src = priors.reduce<LoggedWorkout | undefined>(
          (latest, w) =>
            !latest || new Date(w.at).getTime() > new Date(latest.at).getTime() ? w : latest,
          undefined,
        );
        const bodyKg = state.profile?.weightKg ?? 75;
        // Seed order: your last session → else the sets planned for this
        // weekday → else a single empty done set.
        const planned = state.schedule[day.getDay()]?.plans?.[exercise.id];
        const base: WorkoutSet[] = src
          ? src.sets.map((st) => ({ ...st, done: trained, isPR: false }))
          : planned && planned.length > 0
            ? planned.map((p) => ({ ...p, done: trained, isPR: false }))
            : [{ done: trained }];
        const sets = markPRs(base, exercise.type);
        set((s) => ({
          workouts: [
            {
              id: id(),
              at: stampFor(day),
              updatedAt: stampFor(day),
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              type: exercise.type,
              sets,
              caloriesBurned: trained ? workoutBurn(sets.length, bodyKg) : 0,
            },
            ...s.workouts,
          ],
        }));
      },
      logWater: (ml, at) =>
        set((s) => ({ water: [{ at: at ?? new Date().toISOString(), ml }, ...s.water] })),
      logWeight: (kg, at) =>
        set((s) => ({ weights: [{ at: at ?? new Date().toISOString(), kg }, ...s.weights] })),
      logBodyReading: (entry) =>
        set((s) => ({
          weights: [{ ...entry, at: entry.at ?? new Date().toISOString() }, ...s.weights],
        })),
      setActiveProgram: (activeProgram) => set({ activeProgram }),
      setRemindMeals: (on) => set({ remindMeals: on }),
      setRemindWater: (on) => set({ remindWater: on }),
      setRemindWorkouts: (on) => set({ remindWorkouts: on }),
      setRemindersInitialized: () => set({ remindersInitialized: true }),
      setTutorialSeen: () => set({ tutorialSeen: true }),
      dismissChecklist: () => set({ checklistDismissed: true }),
      setTourSeen: () => set({ tourSeen: true }),
      replayTour: () => set({ tourSeen: false }),
      setHydrated: () => set({ hydrated: true }),
      ensureInstallId: () => {
        const existing = get().installId;
        if (existing) return existing;
        const fresh = `u_${id()}`;
        set({ installId: fresh });
        return fresh;
      },
      setLinkedRef: (ref) => set({ linkedRef: ref }),
      setSyncedAt: (iso) => set({ syncedAt: iso }),
      applySnapshot: (snap) =>
        set({
          profile: snap.profile,
          targets: snap.targets,
          meals: snap.meals,
          exercises: snap.exercises,
          schedule: snap.schedule,
          skips: snap.skips,
          dayOrder: snap.dayOrder,
          workouts: snap.workouts,
          water: snap.water,
          weights: snap.weights,
          activeProgram: snap.activeProgram,
        }),
      resetAll: () =>
        set({
          account: null,
          // The server drops its side of the link on delete, so let a future
          // sign-in claim this install again.
          linkedRef: null,
          syncedAt: null,
          dayOrder: {},
          whoopBurnByDay: {},
          whoopWorkoutsByDay: {},
          whoopBackfilledAt: null,
          language: null,
          profile: null,
          targets: null,
          meals: [],
          exercises: [],
          schedule: {},
          skips: {},
          workouts: [],
          water: [],
          weights: [],
          activeProgram: null,
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
        skips,
        installId,
        linkedRef,
        syncedAt,
        dayOrder,
        whoopBurnByDay,
        whoopWorkoutsByDay,
        whoopBackfilledAt,
        workouts,
        water,
        weights,
        activeProgram,
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
        skips,
        installId,
        linkedRef,
        syncedAt,
        dayOrder,
        whoopBurnByDay,
        whoopWorkoutsByDay,
        whoopBackfilledAt,
        workouts,
        water,
        weights,
        activeProgram,
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

/**
 * Calories for a session, counting only the sets actually marked done.
 *
 * Burning by set COUNT looked equivalent and was not: unticking an exercise
 * zeroed its burn, but then editing it — adding a set, deleting one — recomputed
 * the burn from the length of the list and quietly credited work nobody had
 * claimed to do. Reading the flag makes the two paths agree.
 */
export function burnForSets(sets: WorkoutSet[], bodyKg: number): number {
  return workoutBurn(sets.filter((s) => s.done).length, bodyKg);
}

export function burnedForDay(workouts: LoggedWorkout[], day: Date): number {
  return workouts.reduce(
    (sum, w) => (isSameDay(w.at, day) ? sum + (w.caloriesBurned ?? 0) : sum),
    0,
  );
}

/**
 * How much higher or lower a connected WHOOP's real burn tends to run
 * compared to the set/rep formula, learned from the days both exist for —
 * this is what lets a day with NO WHOOP coverage still benefit from history
 * instead of falling back to the same generic formula forever. 1 (no
 * adjustment) until there are at least 2 usable days to learn from, and
 * clamped to 0.5–2× so one outlier day (a WHOOP workout landing on a day
 * with almost nothing logged in Calgym) can't produce a wild multiplier.
 */
export function whoopCalibrationFactor(
  workouts: LoggedWorkout[],
  whoopBurnByDay: Record<string, number>,
  dayCount = 30,
): number {
  const ratios: number[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const whoopKcal = whoopBurnByDay[dateKey(d)];
    if (whoopKcal == null) continue;
    const formulaKcal = burnedForDay(workouts, d);
    // Too little logged that day for the ratio to mean anything.
    if (formulaKcal < 50) continue;
    ratios.push(whoopKcal / formulaKcal);
  }
  if (ratios.length < 2) return 1;
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return Math.min(2, Math.max(0.5, avg));
}

/**
 * `burnedForDay`, but a connected WHOOP's real heart-rate-based number wins
 * outright for any day it's directly available for, and every other day
 * gets the formula estimate corrected by `whoopCalibrationFactor` — so
 * accuracy improves for the whole history, not only days WHOOP covers.
 */
export function actualBurnedForDay(
  workouts: LoggedWorkout[],
  whoopBurnByDay: Record<string, number>,
  day: Date,
): number {
  const whoopKcal = whoopBurnByDay[dateKey(day)];
  if (whoopKcal != null) return whoopKcal;
  const formula = burnedForDay(workouts, day);
  if (formula === 0) return 0;
  return Math.round(formula * whoopCalibrationFactor(workouts, whoopBurnByDay));
}

/** How far off a logged set's own timestamp a WHOOP-detected workout window
 * is still allowed to start/end and count as "the same session" — a
 * checkmark rarely lands exactly on WHOOP's own start/stop, and neither does
 * the moment the last set of a Track-tab session gets logged. */
const WHOOP_MATCH_BUFFER_MS = 20 * 60 * 1000;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * WHOOP's own measured calories for this one logged exercise, real
 * heart-rate-based numbers instead of the set/rep formula — the per-session
 * equivalent of what `actualBurnedForDay` already does for a whole day, using
 * the individual WHOOP workout records `whoopWorkoutsByDay` already carries
 * (start/end/kcal) rather than only their day-level sum.
 *
 * Two exercises logged back-to-back can both fall inside ONE WHOOP-detected
 * workout (WHOOP sees one continuous gym session; Calgym logs bench press and
 * rows as separate entries) — crediting that WHOOP session's full kcal to
 * each would double-count it once both are added up, so a shared session's
 * calories are split across every logged exercise that overlaps it, by their
 * share of done sets. Returns null when nothing overlaps, so the caller can
 * fall back to the formula estimate.
 */
export function whoopKcalForWorkout(
  workout: LoggedWorkout,
  sameDayWorkouts: LoggedWorkout[],
  whoopWorkoutsForDay: WhoopDayWorkout[],
): number | null {
  if (whoopWorkoutsForDay.length === 0) return null;
  const myStart = new Date(workout.at).getTime() - WHOOP_MATCH_BUFFER_MS;
  const myEnd = new Date(workout.updatedAt ?? workout.at).getTime() + WHOOP_MATCH_BUFFER_MS;
  const mySets = workout.sets.filter((st) => st.done).length;
  if (mySets === 0) return null;

  let total = 0;
  let matched = false;
  for (const ww of whoopWorkoutsForDay) {
    const wStart = new Date(ww.start).getTime();
    const wEnd = new Date(ww.end).getTime();
    if (!overlaps(myStart, myEnd, wStart, wEnd)) continue;
    const sharers = sameDayWorkouts.filter((w) => {
      const s = new Date(w.at).getTime() - WHOOP_MATCH_BUFFER_MS;
      const e = new Date(w.updatedAt ?? w.at).getTime() + WHOOP_MATCH_BUFFER_MS;
      return overlaps(s, e, wStart, wEnd);
    });
    const totalSets = sharers.reduce((n, w) => n + w.sets.filter((st) => st.done).length, 0);
    if (totalSets === 0) continue;
    matched = true;
    total += ww.kcal * (mySets / totalSets);
  }
  return matched ? Math.round(total) : null;
}

/**
 * The number to actually show for one logged exercise: WHOOP's real measured
 * calories when a matching WHOOP workout exists, else the stored set/rep
 * formula estimate. Mirrors `actualBurnedForDay`'s "prefer WHOOP" shape at
 * session granularity.
 */
export function actualBurnedForWorkout(
  workout: LoggedWorkout,
  sameDayWorkouts: LoggedWorkout[],
  whoopWorkoutsByDay: Record<string, WhoopDayWorkout[]>,
): number {
  const whoop = whoopKcalForWorkout(
    workout,
    sameDayWorkouts,
    whoopWorkoutsByDay[dateKey(new Date(workout.at))] ?? [],
  );
  return whoop ?? workout.caloriesBurned ?? 0;
}

/**
 * Apply an ordering override to a set of ids.
 *
 * Ids the override does not mention are appended in their original order, and
 * ids it mentions but that are not present are dropped — so a stale override
 * can never hide an exercise or resurrect a removed one.
 */
export function applyOrder(ids: string[], order: string[] | undefined): string[] {
  if (!order || order.length === 0) return ids;
  const present = new Set(ids);
  const listed = new Set(order);
  return [...order.filter((id) => present.has(id)), ...ids.filter((id) => !listed.has(id))];
}

/** Stable per-day key (local date) for the same-day skip list. */
export function dateKey(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
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
/**
 * How good a set is, for ranking within a session: load first, reps as the
 * tie-break. Exported so anything that orders or highlights sets agrees with
 * the trophy instead of growing its own definition of "best".
 */
export function setScore(s: WorkoutSet, type: LoggedWorkout['type']): number {
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

/**
 * The other days that have training on them, newest first, for the History
 * list. The day being viewed is left out: it is already laid out in full above.
 *
 * The sort is the point. `workouts` is in insertion order, not date order —
 * anything logged against an earlier day (checking off a day you missed,
 * duplicating a session backwards, a restored cloud snapshot) goes to the front
 * of the array — so grouping without sorting put those days at the top of
 * History regardless of when they happened.
 */
export function workoutDays(
  workouts: LoggedWorkout[],
  exclude: Date,
): { key: string; date: Date; items: LoggedWorkout[] }[] {
  const groups = new Map<string, { key: string; date: Date; items: LoggedWorkout[] }>();
  for (const w of workouts) {
    if (isSameDay(w.at, exclude)) continue;
    const d = new Date(w.at);
    const key = dateKey(d);
    const g = groups.get(key);
    if (g) g.items.push(w);
    else groups.set(key, { key, date: d, items: [w] });
  }
  return [...groups.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** The (exercise, day) workout if it exists. */
export function workoutFor(
  workouts: LoggedWorkout[],
  exerciseId: string,
  day: Date,
): LoggedWorkout | undefined {
  return workouts.find((w) => w.exerciseId === exerciseId && isSameDay(w.at, day));
}

/**
 * Consecutive days with at least one logged meal, ending today if today
 * already has one — otherwise ending yesterday, so the count doesn't drop to
 * 0 the moment the calendar rolls over, only once a full day is missed.
 */
export function streakDays(meals: LoggedMeal[]): number {
  let streak = 0;
  const day = new Date();
  if (!meals.some((m) => isSameDay(m.at, day))) day.setDate(day.getDate() - 1);
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

/**
 * Consecutive days with at least one logged workout, ending today if today
 * already has one — otherwise ending yesterday, so the count doesn't drop to
 * 0 the moment the calendar rolls over, only once a full day is missed.
 */
export function workoutStreakDays(workouts: LoggedWorkout[]): number {
  let streak = 0;
  const day = new Date();
  if (!workouts.some((w) => isSameDay(w.at, day))) day.setDate(day.getDate() - 1);
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

/** Where an accepted program stands today — shared by the Overview glance card and the full program screen. */
export function programProgress(program: Program): {
  daysElapsed: number;
  totalDays: number;
  daysLeft: number;
  weekNumber: number;
  pct: number;
} {
  const daysElapsed = Math.max(0, Math.floor((Date.now() - new Date(program.createdAt).getTime()) / 86400000));
  const totalDays = program.durationWeeks * 7;
  const daysLeft = Math.max(0, totalDays - daysElapsed);
  const weekNumber = Math.min(program.durationWeeks, Math.floor(daysElapsed / 7) + 1);
  const pct = totalDays > 0 ? Math.min(100, (daysElapsed / totalDays) * 100) : 0;
  return { daysElapsed, totalDays, daysLeft, weekNumber, pct };
}

/** Meal types already logged on `day`. */
export function mealTypesLogged(meals: LoggedMeal[], day: Date): Set<MealType> {
  const set = new Set<MealType>();
  for (const m of meals) {
    if (isSameDay(m.at, day)) set.add(m.mealType ?? 'snack');
  }
  return set;
}
