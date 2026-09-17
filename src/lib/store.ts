import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { categoryForMuscles, findExercise } from './exercises';
import { perServing, roundMacros, scaleMacros, servingCountLabel } from './recipes';
import type { PlannedRecipeMeal } from './shopping';
import { dailyTargets } from './tdee';
import type {
  ActiveSession,
  ChatMessage,
  CoachReferenceDoc,
  DailyTargets,
  Exercise,
  ExerciseType,
  FastingProtocol,
  FastingSession,
  FoodItem,
  Goal,
  Language,
  LoggedMeal,
  LoggedWorkout,
  MealPlan,
  MealType,
  MuscleGroup,
  PlannedMeal,
  PlannedSet,
  Profile,
  Program,
  Recipe,
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
   * Saved recipes — dishes with ingredients and steps, as opposed to a
   * PlannedMeal, which is only a name and its macros. Kept once generated so
   * reopening one never costs another AI call.
   */
  recipes: Recipe[];
  /**
   * The shopping trip in progress. Only DECISIONS live here — which dates,
   * what is already in the cupboard, what has been ticked off and at what
   * quantity, and which recipes are being cooked as one batch. The amounts
   * are recomputed from the plan every time the list is opened, so a plan
   * change moves the quantities without throwing away the progress.
   */
  shopping: {
    fromKey: string;
    toKey: string;
    /** Ticked off in the shop, and the amount it was ticked at — so a later
     * increase reads as "300 g more needed" rather than silently passing. */
    checkedAt: Record<string, number>;
    /** "Already have this" — excluded from what needs buying. */
    have: Record<string, boolean>;
    /** recipeId → these meals come out of one pot. */
    oneBatch: Record<string, boolean>;
  } | null;
  /**
   * Recurring weekly plan: weekday (0=Sun … 6=Sat) → exercises for that day,
   * plus optional planned target sets per exercise (`plans`).
   */
  schedule: Record<
    number,
    { title?: string; exerciseIds: string[]; plans?: Record<string, PlannedSet[]> }
  >;
  /**
   * Named schedules you can keep side by side — Gym, Home, Travel — and load
   * one at a time.
   *
   * `schedule` above stays the single source of truth for what you are doing
   * NOW, so every screen that reads it is unchanged. These are saved copies:
   * activating one replaces the working schedule, and "update" captures the
   * working schedule back into it. Explicit in both directions, because a
   * schedule silently rewriting itself under you is worse than one that asks.
   */
  savedSchedules: {
    id: string;
    /** Empty means "use the default label" — a migration cannot localise. */
    name: string;
    days: Record<
      number,
      { title?: string; exerciseIds: string[]; plans?: Record<string, PlannedSet[]> }
    >;
    createdAt: string;
    /** When this was last loaded, shown as "active since". */
    activatedAt?: string;
  }[];
  /** Which saved schedule the working schedule was last loaded from. */
  activeScheduleId: string | null;
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
  /** When today's WHOOP burn was last fetched (regardless of what it
   * returned) — shown next to the burn card so a stale-looking number is
   * visibly stale, not silently wrong. */
  whoopLastFetchedAt: string | null;
  workouts: LoggedWorkout[];
  water: WaterEntry[];
  weights: WeightEntry[];
  /** The one AI-designed program currently in effect, if the user has accepted one. */
  activeProgram: Program | null;
  /** Per-day meal-plan swaps: dateKey → slot → the weekday whose planned
   * meal stands in for that slot. Empty for days following the plan as
   * written. Additive (old persisted state simply lacks it → `{}`). */
  mealPlanSwaps: Record<string, Partial<Record<MealType, number>>>;
  /**
   * A recipe standing in for one planned slot on ONE specific date
   * (dateKey → slot → which recipe, and how much of it is one portion).
   *
   * Deliberately per-date rather than per-weekday: replacing today's lunch
   * should change today's lunch, not every Tuesday for the rest of the
   * programme. Changing the saved recipe, or other days, stays an explicit
   * separate act. Additive — old persisted state simply lacks it.
   */
  mealPlanRecipes: Record<
    string,
    Partial<Record<MealType, { recipeId: string; servings: number; programId?: string; batchId?: string }>>
  >;
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
  /** One ongoing coach conversation — persisted so leaving the tab or
   * restarting the app doesn't lose it, the way it used to. */
  coachMessages: ChatMessage[];
  /** Indices into coachMessages whose proposed schedule plan has already
   * been added to the weekly schedule — a plain array, not a Set, since a
   * Set doesn't survive JSON persistence. */
  coachAppliedPlans: number[];
  /** Documents the user has taught the coach — see CoachReferenceDoc. */
  coachReferenceDocs: CoachReferenceDoc[];
  /** The fast currently running, if any — cleared once ended or cancelled. */
  activeFast: FastingSession | null;
  /** Completed fasts, most recent first. */
  fastingHistory: FastingSession[];
  /** The workout being followed right now, if any — see ActiveSession. */
  activeSession: ActiveSession | null;
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
  /**
   * Fold a duplicate exercise into the one it duplicates, then delete it.
   * Everything logged against it moves across — history, weekly schedule,
   * planned sets, skips, day ordering and any session in progress — so the
   * sets someone already did are kept, just filed under the right exercise.
   */
  mergeExercise: (fromId: string, intoId: string) => void;
  /** Start (or restart) a shopping trip for a stretch of dates. */
  startShopping: (fromKey: string, toKey: string) => void;
  setShoppingChecked: (key: string, amount: number | null) => void;
  setShoppingHave: (key: string, have: boolean) => void;
  setShoppingOneBatch: (recipeId: string, oneBatch: boolean) => void;
  clearShopping: () => void;
  /** Saves a generated or hand-written recipe and returns its id. */
  addRecipe: (input: Omit<Recipe, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => string;
  updateRecipe: (id: string, patch: Partial<Recipe>) => void;
  removeRecipe: (id: string) => void;
  /** Append a set to the (exercise, day) workout, creating it if needed. */
  logSet: (
    exercise: { id: string; name: string; type: LoggedWorkout['type']; category?: MuscleGroup },
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
    exercise: { id: string; name: string; type: LoggedWorkout['type']; category?: MuscleGroup },
    day: Date,
    /** false seeds the record but leaves it not-trained (no burn). */
    trained?: boolean,
  ) => void;
  /** Set (or, with null, clear) WHOOP's real burn for a day — see whoopBurnByDay. */
  setWhoopDayBurn: (day: Date, kcal: number | null) => void;
  /** Set (or, with [], clear) the individual WHOOP workouts a day is made of. */
  setWhoopDayWorkouts: (day: Date, workouts: WhoopDayWorkout[]) => void;
  setWhoopBackfilledAt: (iso: string | null) => void;
  setWhoopLastFetchedAt: (iso: string | null) => void;
  logWater: (ml: number, at?: string) => void;
  logWeight: (kg: number, at?: string) => void;
  /** A fuller reading (manual or scanned) — same log as logWeight, with the
   * optional body-fat/segmental fields a quick Overview weigh-in never sets. */
  logBodyReading: (entry: Omit<WeightEntry, 'at'> & { at?: string }) => void;
  /** Removes one weight/body-reading entry (matched by its `at` timestamp,
   * the only thing that uniquely identifies it) — the whole record, body
   * composition fields included, not just the kg number. */
  deleteWeight: (at: string) => void;
  /** Accept, replace, or end (pass null) the active AI-designed program.
   * Committing its targets/schedule is a separate step (setTargets /
   * applyCoachSchedule) so a program is just data here, same as any other
   * proposal the coach hands the UI to act on. */
  setActiveProgram: (program: Program | null) => void;
  /** Swap the planned meal for one slot on one day (dateKey) for the plan's
   * meal in that slot from another weekday — "not kabsa today, give me
   * Tuesday's lunch instead". Pass null to go back to the day's own meal. */
  /** Capture the working schedule as a new named one, and make it active. */
  saveScheduleAs: (name: string) => string;
  /** Capture the working schedule back into a saved one. */
  updateSavedSchedule: (id: string) => void;
  /** Load a saved schedule into the working schedule. History and any session
   * in progress are untouched. */
  activateSchedule: (id: string) => void;
  renameSchedule: (id: string, name: string) => void;
  deleteSchedule: (id: string) => void;
  swapPlannedMeal: (dayKey: string, slot: MealType, fromWeekday: number | null) => void;
  /** Point one planned slot on one date at a recipe, or pass null to put the
   * programme's own meal back. */
  setPlannedRecipe: (
    dayKey: string,
    slot: MealType,
    value: { recipeId: string; servings: number; batchId?: string } | null,
  ) => void;
  startSession: (day: Date, exerciseIds: string[]) => void;
  updateSession: (patch: Partial<ActiveSession>) => void;
  endSession: () => void;
  setRemindMeals: (on: boolean) => void;
  setRemindWater: (on: boolean) => void;
  setRemindWorkouts: (on: boolean) => void;
  setRemindersInitialized: () => void;
  setTutorialSeen: () => void;
  dismissChecklist: () => void;
  setTourSeen: () => void;
  /** Re-arm the coach-mark tour (from Profile → Replay tour). */
  replayTour: () => void;
  setCoachMessages: (messages: ChatMessage[]) => void;
  markCoachPlanApplied: (index: number) => void;
  /** Discards the current conversation — a fresh start, not a soft reset. */
  resetCoachChat: () => void;
  /** Adds a reference doc, evicting the oldest once at MAX_COACH_REFERENCE_DOCS. */
  addCoachReferenceDoc: (doc: Omit<CoachReferenceDoc, 'id' | 'addedAt'>) => void;
  removeCoachReferenceDoc: (docId: string) => void;
  /** Begins a new fast — replaces any already-active one (the UI should
   * never offer starting a second while one is running, but this stays a
   * plain overwrite rather than a no-op so it can't get stuck). */
  startFast: (protocol: FastingProtocol, targetHours: number) => void;
  /** Ends the active fast and files it in fastingHistory. No-op if none is running. */
  endFast: () => void;
  /** Discards the active fast without recording it in history — for
   * "started by mistake", distinct from ending one early on purpose. */
  cancelFast: () => void;
  deleteFastingSession: (id: string) => void;
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

/** How many documents the coach can remember at once — each is just a
 * short summary, not the raw file, so this is about keeping what it
 * recalls focused and manageable to review, not storage size. Adding past
 * this evicts the oldest. */
export const MAX_COACH_REFERENCE_DOCS = 5;

/** Fixed fasting windows the timer offers as one-tap presets — 'custom' asks
 * for its own hour count instead of reading from here. */
export const FASTING_PROTOCOL_HOURS: Record<Exclude<FastingProtocol, 'custom'>, number> = {
  '16:8': 16,
  '18:6': 18,
  '20:4': 20,
  omad: 23,
};

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
      savedSchedules: [],
      activeScheduleId: null,
      skips: {},
      installId: null,
      linkedRef: null,
      syncedAt: null,
      dayOrder: {},
      whoopBurnByDay: {},
      whoopWorkoutsByDay: {},
      whoopBackfilledAt: null,
      whoopLastFetchedAt: null,
      workouts: [],
      water: [],
      weights: [],
      activeProgram: null,
      mealPlanSwaps: {},
      mealPlanRecipes: {},
      recipes: [],
      shopping: null,
      remindMeals: true,
      remindWater: true,
      remindWorkouts: true,
      remindersInitialized: false,
      tutorialSeen: false,
      checklistDismissed: false,
      tourSeen: false,
      coachMessages: [],
      coachAppliedPlans: [],
      coachReferenceDocs: [],
      activeFast: null,
      fastingHistory: [],
      activeSession: null,
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
      startShopping: (fromKey, toKey) =>
        set((s) => ({
          // Re-picking the same dates keeps the trip you are already on; a
          // different stretch is a different trip and starts clean.
          shopping:
            s.shopping && s.shopping.fromKey === fromKey && s.shopping.toKey === toKey
              ? s.shopping
              : { fromKey, toKey, checkedAt: {}, have: {}, oneBatch: {} },
        })),
      setShoppingChecked: (key, amount) =>
        set((s) => {
          if (!s.shopping) return {};
          const checkedAt = { ...s.shopping.checkedAt };
          if (amount == null) delete checkedAt[key];
          else checkedAt[key] = amount;
          return { shopping: { ...s.shopping, checkedAt } };
        }),
      setShoppingHave: (key, have) =>
        set((s) => {
          if (!s.shopping) return {};
          const next = { ...s.shopping.have };
          if (have) next[key] = true;
          else delete next[key];
          return { shopping: { ...s.shopping, have: next } };
        }),
      setShoppingOneBatch: (recipeId, oneBatch) =>
        set((s) => {
          if (!s.shopping) return {};
          const next = { ...s.shopping.oneBatch };
          if (oneBatch) next[recipeId] = true;
          else delete next[recipeId];
          return { shopping: { ...s.shopping, oneBatch: next } };
        }),
      clearShopping: () => set({ shopping: null }),
      addRecipe: (input) => {
        const rid = input.id ?? `recipe:${id()}`;
        set((s) => ({
          recipes: [
            { ...input, id: rid, createdAt: input.createdAt ?? new Date().toISOString() },
            ...s.recipes.filter((r) => r.id !== rid),
          ],
        }));
        return rid;
      },
      updateRecipe: (rid, patch) =>
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === rid ? { ...r, ...patch } : r)) })),
      removeRecipe: (rid) => set((s) => ({ recipes: s.recipes.filter((r) => r.id !== rid) })),
      mergeExercise: (fromId, intoId) =>
        set((s) => {
          if (fromId === intoId) return {};
          const target = findExercise(intoId, s.exercises);
          if (!target) return {};
          const bodyKg = s.profile?.weightKg ?? 75;
          // Replace the id wherever it appears in a list, without leaving a
          // duplicate behind if the target was already in that same list.
          const swapList = (ids: string[]): string[] => {
            const out: string[] = [];
            for (const id of ids) {
              const next = id === fromId ? intoId : id;
              if (!out.includes(next)) out.push(next);
            }
            return out;
          };

          const workouts = s.workouts.map((w) =>
            w.exerciseId === fromId
              ? {
                  ...w,
                  exerciseId: intoId,
                  exerciseName: target.name,
                  // The burn was computed from the old exercise's category and
                  // MET, so it has to be redone against the one it now belongs
                  // to — otherwise the history keeps the wrong figure forever.
                  caloriesBurned: burnForSets(
                    w.sets,
                    bodyKg,
                    target.category,
                    elapsedMinutes(w.at, w.updatedAt),
                    target,
                  ),
                }
              : w,
          );

          const schedule: typeof s.schedule = {};
          for (const [weekday, day] of Object.entries(s.schedule)) {
            const plans = day.plans ? { ...day.plans } : undefined;
            // Planned sets follow the exercise, but never overwrite targets
            // the person already set on the exercise being merged into.
            if (plans && plans[fromId]) {
              if (!plans[intoId]) plans[intoId] = plans[fromId];
              delete plans[fromId];
            }
            schedule[Number(weekday)] = { ...day, exerciseIds: swapList(day.exerciseIds), plans };
          }

          const remap = (rec: Record<string, string[]>): Record<string, string[]> =>
            Object.fromEntries(Object.entries(rec).map(([k, ids]) => [k, swapList(ids)]));

          return {
            workouts,
            schedule,
            skips: remap(s.skips),
            dayOrder: remap(s.dayOrder),
            activeSession: s.activeSession
              ? { ...s.activeSession, exerciseIds: swapList(s.activeSession.exerciseIds) }
              : s.activeSession,
            // Built-ins live in code, so only a custom entry is ever removed.
            exercises: s.exercises.filter((e) => e.id !== fromId),
          };
        }),
      logSet: (exercise, newSet, at) =>
        set((s) => {
          const when = at ?? new Date().toISOString();
          const bodyKg = s.profile?.weightKg ?? 75;
          // Callers pass only enough to name the workout, so the MET and pace
          // model live on the library entry, not on what was handed in. Look
          // the full exercise up here or a freshly logged padel match burns at
          // the coarse category rate while the very same session, once edited,
          // recalculates correctly — the recalculation paths already look it up.
          const full = findExercise(exercise.id, s.exercises) ?? exercise;
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
                  ? {
                      ...w,
                      sets: withPR,
                      updatedAt: when,
                      caloriesBurned: burnForSets(
                        withPR,
                        bodyKg,
                        full.category,
                        elapsedMinutes(existing.at, when),
                        full,
                      ),
                    }
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
                caloriesBurned: burnForSets(sets, bodyKg, full.category, undefined, full),
              },
              ...s.workouts,
            ],
          };
        }),
      updateSet: (workoutId, index, patch, at) =>
        set((s) => {
          const bodyKg = s.profile?.weightKg ?? 75;
          return {
            workouts: s.workouts.map((w) => {
              if (w.id !== workoutId) return w;
              const sets = w.sets.map((st, i) => (i === index ? { ...st, ...patch } : st));
              const updatedAt = at ?? w.updatedAt;
              const ex = findExercise(w.exerciseId, s.exercises);
              const category = ex?.category;
              return {
                ...w,
                sets: markPRs(sets, w.type),
                updatedAt,
                caloriesBurned: burnForSets(sets, bodyKg, category, elapsedMinutes(w.at, updatedAt), ex),
              };
            }),
          };
        }),
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
            const ex = findExercise(w.exerciseId, s.exercises);
            const category = ex?.category;
            workouts.push({
              ...w,
              sets: markPRs(sets, w.type),
              caloriesBurned: burnForSets(sets, bodyKg, category, elapsedMinutes(w.at, w.updatedAt), ex),
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
              const ex = findExercise(w.exerciseId, s.exercises);
              const category = ex?.category;
              return {
                ...w,
                sets,
                caloriesBurned: burnForSets(sets, bodyKg, category, elapsedMinutes(w.at, w.updatedAt), ex),
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
      setWhoopLastFetchedAt: (iso) => set({ whoopLastFetchedAt: iso }),
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
              caloriesBurned: trained ? workoutBurn(sets.length, bodyKg, exercise.category) : 0,
            },
            ...s.workouts,
          ],
        }));
      },
      logWater: (ml, at) =>
        set((s) => ({ water: [{ at: at ?? new Date().toISOString(), ml }, ...s.water] })),
      // Sorted on insert (not just prepended) because a reading's `at` is not
      // always "now" — a past day's Overview entry, and especially an
      // imported historical report, can land anywhere in the timeline. Every
      // other reader of `weights` (trend charts, "most recent reading",
      // Overview's day list) assumes index 0 is the newest.
      logWeight: (kg, at) =>
        set((s) => ({
          weights: [{ at: at ?? new Date().toISOString(), kg }, ...s.weights].sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          ),
        })),
      logBodyReading: (entry) =>
        set((s) => ({
          weights: [{ ...entry, at: entry.at ?? new Date().toISOString() }, ...s.weights].sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          ),
        })),
      deleteWeight: (at) => set((s) => ({ weights: s.weights.filter((w) => w.at !== at) })),
      setActiveProgram: (activeProgram) =>
        set((s) => {
          // A replacement belongs to the plan it was made against. Switching
          // programmes drops the ones that no longer apply rather than
          // re-pointing them at a different plan's meals — the slot visibly
          // reverts to the new programme's own meal, which is the honest
          // outcome and the visible one.
          const keep: typeof s.mealPlanRecipes = {};
          for (const [dayKey, slots] of Object.entries(s.mealPlanRecipes)) {
            const kept: (typeof slots) = {};
            for (const [slot, entry] of Object.entries(slots)) {
              if (!entry) continue;
              // No programId means it predates this stamping; leave it be
              // rather than deleting something the person set up.
              if (entry.programId == null || entry.programId === activeProgram?.id) {
                kept[slot as MealType] = entry;
              }
            }
            if (Object.keys(kept).length > 0) keep[dayKey] = kept;
          }
          return { activeProgram, mealPlanRecipes: keep };
        }),
      setPlannedRecipe: (dayKey, slot, value) =>
        set((s) => {
          const day = { ...(s.mealPlanRecipes[dayKey] ?? {}) };
          if (value == null) delete day[slot];
          // Stamped with the programme it was made against. "Tuesday's lunch"
          // only means something inside a particular plan, so on a programme
          // switch this stops an old replacement from silently attaching
          // itself to a different plan's meal.
          else day[slot] = { ...value, programId: s.activeProgram?.id };
          return { mealPlanRecipes: { ...s.mealPlanRecipes, [dayKey]: day } };
        }),
      saveScheduleAs: (name) => {
        const sid = `sched:${id()}`;
        const now = new Date().toISOString();
        set((s) => ({
          savedSchedules: [
            ...s.savedSchedules,
            { id: sid, name: name.trim(), days: s.schedule, createdAt: now, activatedAt: now },
          ],
          activeScheduleId: sid,
        }));
        return sid;
      },
      updateSavedSchedule: (sid) =>
        set((s) => ({
          savedSchedules: s.savedSchedules.map((x) => (x.id === sid ? { ...x, days: s.schedule } : x)),
        })),
      activateSchedule: (sid) =>
        set((s) => {
          const found = s.savedSchedules.find((x) => x.id === sid);
          if (!found) return {};
          const now = new Date().toISOString();
          // Only the plan moves. Logged workouts, personal bests and a session
          // already in progress are records of what happened and are never a
          // schedule's to rewrite.
          return {
            schedule: found.days,
            activeScheduleId: sid,
            savedSchedules: s.savedSchedules.map((x) => (x.id === sid ? { ...x, activatedAt: now } : x)),
          };
        }),
      renameSchedule: (sid, name) =>
        set((s) => ({
          savedSchedules: s.savedSchedules.map((x) => (x.id === sid ? { ...x, name: name.trim() } : x)),
        })),
      deleteSchedule: (sid) =>
        set((s) => ({
          savedSchedules: s.savedSchedules.filter((x) => x.id !== sid),
          // The working schedule stays exactly as it is — deleting a saved
          // copy must not empty the week you are training.
          activeScheduleId: s.activeScheduleId === sid ? null : s.activeScheduleId,
        })),
      swapPlannedMeal: (dayKey, slot, fromWeekday) =>
        set((s) => {
          const day = { ...(s.mealPlanSwaps[dayKey] ?? {}) };
          if (fromWeekday == null) delete day[slot];
          else day[slot] = fromWeekday;
          return { mealPlanSwaps: { ...s.mealPlanSwaps, [dayKey]: day } };
        }),
      startSession: (day, exerciseIds) =>
        set({
          activeSession: {
            startedAt: new Date().toISOString(),
            dayKey: dateKey(day),
            exerciseIds,
            index: 0,
            restEndsAt: null,
            restSeconds: 90,
          },
        }),
      updateSession: (patch) =>
        set((s) => (s.activeSession ? { activeSession: { ...s.activeSession, ...patch } } : {})),
      endSession: () => set({ activeSession: null }),
      setRemindMeals: (on) => set({ remindMeals: on }),
      setRemindWater: (on) => set({ remindWater: on }),
      setRemindWorkouts: (on) => set({ remindWorkouts: on }),
      setRemindersInitialized: () => set({ remindersInitialized: true }),
      setTutorialSeen: () => set({ tutorialSeen: true }),
      dismissChecklist: () => set({ checklistDismissed: true }),
      setTourSeen: () => set({ tourSeen: true }),
      replayTour: () => set({ tourSeen: false }),
      setCoachMessages: (messages) => set({ coachMessages: messages }),
      markCoachPlanApplied: (index) =>
        set((s) => ({ coachAppliedPlans: [...s.coachAppliedPlans, index] })),
      resetCoachChat: () => set({ coachMessages: [], coachAppliedPlans: [] }),
      addCoachReferenceDoc: (doc) =>
        set((s) => {
          const next = [
            ...s.coachReferenceDocs,
            { ...doc, id: id(), addedAt: new Date().toISOString() },
          ];
          return { coachReferenceDocs: next.slice(-MAX_COACH_REFERENCE_DOCS) };
        }),
      removeCoachReferenceDoc: (docId) =>
        set((s) => ({
          coachReferenceDocs: s.coachReferenceDocs.filter((d) => d.id !== docId),
        })),
      startFast: (protocol, targetHours) =>
        set({ activeFast: { id: id(), startedAt: new Date().toISOString(), protocol, targetHours } }),
      endFast: () =>
        set((s) =>
          s.activeFast
            ? {
                activeFast: null,
                fastingHistory: [
                  { ...s.activeFast, endedAt: new Date().toISOString() },
                  ...s.fastingHistory,
                ],
              }
            : {},
        ),
      cancelFast: () => set({ activeFast: null }),
      deleteFastingSession: (sessionId) =>
        set((s) => ({ fastingHistory: s.fastingHistory.filter((f) => f.id !== sessionId) })),
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
          whoopLastFetchedAt: null,
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
          coachMessages: [],
          coachAppliedPlans: [],
          coachReferenceDocs: [],
          activeFast: null,
          fastingHistory: [],
        }),
    }),
    {
      name: 'calapp-store',
      version: 13,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: migrateStore,
      partialize: ({
        account,
        language,
        profile,
        targets,
        meals,
        exercises,
        recipes,
        shopping,
        schedule,
        savedSchedules,
        activeScheduleId,
        skips,
        installId,
        linkedRef,
        syncedAt,
        dayOrder,
        whoopBurnByDay,
        whoopWorkoutsByDay,
        whoopBackfilledAt,
        whoopLastFetchedAt,
        workouts,
        water,
        weights,
        activeProgram,
        mealPlanSwaps,
        mealPlanRecipes,
        remindMeals,
        remindWater,
        remindWorkouts,
        remindersInitialized,
        tutorialSeen,
        checklistDismissed,
        tourSeen,
        coachMessages,
        coachAppliedPlans,
        coachReferenceDocs,
        activeFast,
        fastingHistory,
        activeSession,
      }) => ({
        account,
        language,
        profile,
        targets,
        meals,
        exercises,
        recipes,
        shopping,
        schedule,
        savedSchedules,
        activeScheduleId,
        skips,
        installId,
        linkedRef,
        syncedAt,
        dayOrder,
        whoopBurnByDay,
        whoopWorkoutsByDay,
        whoopBackfilledAt,
        whoopLastFetchedAt,
        workouts,
        water,
        weights,
        activeProgram,
        mealPlanSwaps,
        mealPlanRecipes,
        remindMeals,
        remindWater,
        remindWorkouts,
        remindersInitialized,
        tutorialSeen,
        checklistDismissed,
        tourSeen,
        coachMessages,
        coachAppliedPlans,
        coachReferenceDocs,
        activeFast,
        fastingHistory,
        activeSession,
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
 *
 * v2 → v3: `weights` wasn't always inserted in sorted order (logWeight/
 * logBodyReading used to blind-prepend), so anyone with data older than
 * that fix can have entries genuinely out of order — every reader in the
 * app treats index 0 as "the latest reading", so a one-time sort here
 * straightens out whatever the old insert order left behind.
 *
 * v3 → v4: `updateSet` used to skip recomputing `caloriesBurned` — a
 * workout completed by editing an existing (often plan-copied, born at 0)
 * set rather than logging a brand new one could get stuck showing no
 * calories at all. Recomputing every workout's burn from its own sets here
 * fixes whatever that left behind; new edits are already fixed at the
 * source.
 *
 * v4 → v5: `profile.age` (a number, frozen at whatever it was when entered)
 * is replaced by `profile.birthDate`, computed fresh every time so it never
 * goes stale. A real birth date isn't recoverable from a stored age, so
 * this backs out an approximate one (Jan 1 of the matching birth year) —
 * accurate to within a year, good enough to keep targets working until the
 * user is prompted to confirm their real birth date.
 *
 * v5 → v6: the activity-level multiplier table was corrected to
 * calculator.net's actual verified 6-tier values (a new "extra_active" tier
 * added, and moderate/active/very_active's multipliers shifted down to make
 * room for it — see tdee.ts). `targets` is a cached snapshot, not derived
 * live, so it would otherwise keep showing calorie numbers computed under
 * the old table until the next unrelated profile edit — recomputing it here
 * makes the fix take effect immediately for anyone who already has a
 * profile, the same way v4's caloriesBurned fix did for workouts.
 *
 * v6 → v7: the lose/gain calorie math itself was corrected to match
 * calculator.net exactly — 7000 kcal per kg (not ~7700), and the 25%-of-
 * maintenance safety clamp on aggressive paces was removed, so a 1 kg/week
 * pace now shows the same uncapped number calculator.net does. Same
 * reasoning as v6: recompute the cached `targets` now instead of leaving it
 * stale until the next profile edit.
 *
 * v7 → v8: `workoutBurn` used a flat MET 5.0 and a flat 2-minutes-per-set
 * assumption for every exercise, so a heavy compound lift and a light
 * isolation move with the same set count always showed identical calories
 * — and WHOOP's real per-session total, split across overlapping exercises
 * by that same flat estimate, inherited the same flatness. Now MET varies
 * by muscle group and real elapsed time is used when it's known. Same
 * reasoning as v3 → v4: recompute every workout's cached `caloriesBurned`
 * now instead of only new ones going forward.
 *
 * v8 → v9: the real-elapsed-time credit v7 → v8 introduced had no ceiling
 * — a long gap between a workout's first and last logged set (a pause, an
 * interruption, a late edit) was taken completely at face value, letting a
 * couple of sets with an hour between them outweigh a whole heavy session.
 * Now capped per set. Same reasoning as v7 → v8: recompute again so the
 * uncapped numbers don't linger.
 */
function migrateStore(persisted: unknown, version: number): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const state = persisted as Record<string, unknown>;

  if (version < 3 && Array.isArray(state.weights)) {
    state.weights = [...(state.weights as { at: string }[])].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }

  if (version < 4 && Array.isArray(state.workouts)) {
    const bodyKg = (state.profile as { weightKg?: number } | null | undefined)?.weightKg ?? 75;
    state.workouts = (state.workouts as LoggedWorkout[]).map((w) => ({
      ...w,
      caloriesBurned: burnForSets(w.sets, bodyKg),
    }));
  }

  if (version < 5 && state.profile && typeof state.profile === 'object') {
    const p = state.profile as Record<string, unknown>;
    if (typeof p.age === 'number' && typeof p.birthDate !== 'string') {
      p.birthDate = `${new Date().getFullYear() - p.age}-01-01`;
    }
    delete p.age;
  }

  if (version < 6 && state.profile && typeof state.profile === 'object') {
    state.targets = dailyTargets(state.profile as Profile);
  }

  if (version < 7 && state.profile && typeof state.profile === 'object') {
    state.targets = dailyTargets(state.profile as Profile);
  }

  if (version < 8 && Array.isArray(state.workouts)) {
    const bodyKg = (state.profile as { weightKg?: number } | null | undefined)?.weightKg ?? 75;
    const custom: Exercise[] = Array.isArray(state.exercises) ? (state.exercises as Exercise[]) : [];
    state.workouts = (state.workouts as LoggedWorkout[]).map((w) => {
      const category = findExercise(w.exerciseId, custom)?.category;
      return {
        ...w,
        caloriesBurned: burnForSets(w.sets, bodyKg, category, elapsedMinutes(w.at, w.updatedAt)),
      };
    });
  }

  // v8 → v9: the real-elapsed-time credit v7→v8 introduced had no ceiling —
  // a long gap between a workout's first and last logged set (a pause, an
  // interruption, a set edited long after the fact) got taken completely at
  // face value, so a handful of sets with an hour-long gap between them
  // could outweigh a whole heavy session. Now capped per set (see
  // MAX_MINUTES_PER_SET). Recomputing again so v8's uncapped numbers don't
  // linger until the next unrelated edit touches each workout.
  if (version < 9 && Array.isArray(state.workouts)) {
    const bodyKg = (state.profile as { weightKg?: number } | null | undefined)?.weightKg ?? 75;
    const custom: Exercise[] = Array.isArray(state.exercises) ? (state.exercises as Exercise[]) : [];
    state.workouts = (state.workouts as LoggedWorkout[]).map((w) => {
      const category = findExercise(w.exerciseId, custom)?.category;
      return {
        ...w,
        caloriesBurned: burnForSets(w.sets, bodyKg, category, elapsedMinutes(w.at, w.updatedAt)),
      };
    });
  }

  // v9 → v10: single-set workouts no longer credit elapsed time (see
  // workoutBurn) — recompute so an orphaned set edited after the fact stops
  // carrying a duration it never had. Additive: no field changes, so a
  // rollback to v9 reads this state unchanged.
  if (version < 10 && Array.isArray(state.workouts)) {
    const bodyKg = (state.profile as { weightKg?: number } | null | undefined)?.weightKg ?? 75;
    const custom: Exercise[] = Array.isArray(state.exercises) ? (state.exercises as Exercise[]) : [];
    state.workouts = (state.workouts as LoggedWorkout[]).map((w) => {
      const category = findExercise(w.exerciseId, custom)?.category;
      return {
        ...w,
        caloriesBurned: burnForSets(w.sets, bodyKg, category, elapsedMinutes(w.at, w.updatedAt)),
      };
    });
  }

  // v10 → v11: timed and distance work is now burned by its own clock and
  // pace rather than by a set count (see burnForSets). Without this, a padel
  // match or a run logged before the change keeps the old figure — a 90-minute
  // match frozen at the ~20 kcal that two assumed minutes produced.
  // Additive: recomputes an existing field, adds none, so a rollback to v10
  // reads this state unchanged.
  if (version < 11 && Array.isArray(state.workouts)) {
    const bodyKg = (state.profile as { weightKg?: number } | null | undefined)?.weightKg ?? 75;
    // Scans used to be filed under Full body no matter what they were, so a
    // recognisable back machine sits in the wrong group with no muscle map.
    // The muscles were saved correctly all along, so re-file from those —
    // only moving entries that are demonstrably somewhere else, never the
    // genuine whole-body movements.
    if (Array.isArray(state.exercises)) {
      state.exercises = (state.exercises as Exercise[]).map((e) => {
        if (e.category !== 'fullBody') return e;
        const derived = categoryForMuscles(e.primaryMuscles);
        return derived && derived !== 'fullBody' ? { ...e, category: derived } : e;
      });
    }
    const custom: Exercise[] = Array.isArray(state.exercises) ? (state.exercises as Exercise[]) : [];
    state.workouts = (state.workouts as LoggedWorkout[]).map((w) => {
      const ex = findExercise(w.exerciseId, custom);
      return {
        ...w,
        caloriesBurned: burnForSets(w.sets, bodyKg, ex?.category, elapsedMinutes(w.at, w.updatedAt), ex),
      };
    });
  }

  // v11 → v12: recipes are new, so an older store simply has none. Purely
  // additive — a rollback to v11 reads this state unchanged, since nothing
  // before v12 looks at the field.
  if (version < 12 && !Array.isArray(state.recipes)) {
    state.recipes = [];
  }
  if (version < 12 && !state.mealPlanRecipes) {
    state.mealPlanRecipes = {};
  }

  // v12 → v13: the week someone already built becomes their first saved
  // schedule, so turning on presets never looks like losing it. The name is
  // left blank because a migration cannot localise; the screen shows a
  // default label for that. Additive — nothing before v13 reads either field.
  if (version < 13 && !Array.isArray(state.savedSchedules)) {
    const existing = (state.schedule ?? {}) as Record<string, unknown>;
    const hasWeek = Object.values(existing).some(
      (d) => Array.isArray((d as { exerciseIds?: string[] })?.exerciseIds) &&
        ((d as { exerciseIds: string[] }).exerciseIds.length > 0),
    );
    const now = new Date().toISOString();
    state.savedSchedules = hasWeek
      ? [{ id: 'sched:original', name: '', days: state.schedule, createdAt: now, activatedAt: now }]
      : [];
    state.activeScheduleId = hasWeek ? 'sched:original' : null;
  }

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
 * Rough resistance-training MET by muscle group. A flat MET 5.0 for every
 * exercise made a heavy compound lift and a light isolation move come out
 * identical whenever they had the same set count — exercise-physiology
 * comparisons of resistance exercises (e.g. leg press vs. biceps curl at
 * matched effort) consistently find large-muscle/compound movements cost
 * meaningfully more per minute than small isolation work. Still a broad
 * approximation, not a lab measurement — MET 5.0 (general vigorous
 * resistance training) stays the baseline this scales from.
 */
const MET_BY_CATEGORY: Record<MuscleGroup, number> = {
  legs: 6.0,
  glutes: 6.0,
  back: 6.0,
  fullBody: 6.5,
  chest: 5.5,
  shoulders: 5.5,
  core: 5.0,
  cardio: 7.0,
  biceps: 4.0,
  triceps: 4.0,
  calves: 4.0,
  forearms: 3.5,
};

/** Minutes assumed per done set (work + rest) when there's no real logged
 * timing to fall back on — e.g. a Training-tab checkmark logs a whole
 * session in one shot, with nothing to measure elapsed time from. Also the
 * per-set ceiling real elapsed time gets capped to, below. */
const DEFAULT_MINUTES_PER_SET = 2;

/** A per-set ceiling on how much real elapsed time gets credited, and the
 * floor below which it's not trusted at all. A gap between the first and
 * last logged set that's small is probably noise (a timestamp rounding, an
 * instant double-tap); one that's large for how few sets there were is more
 * likely a pause, an interruption, or a set edited long after the fact than
 * genuinely continuous training — capping per set (rather than rejecting
 * the whole reading past one flat ceiling) means a real 20-minute gap on 2
 * sets gets reined in the same way a real 20-minute gap on 10 sets doesn't
 * need to be, instead of either trusting an implausible number outright or
 * throwing away a plausible one.  */
const MIN_TRUSTED_MINUTES = 0.5;
const MAX_MINUTES_PER_SET = 5;

/** Real elapsed time between a workout's first and last logged set, when
 * both are known and long enough to be worth trusting over the flat
 * per-set assumption — undefined otherwise. Not capped here; workoutBurn
 * applies the per-set ceiling once it knows the set count. */
export function elapsedMinutes(atIso: string, updatedAtIso?: string): number | undefined {
  if (!updatedAtIso) return undefined;
  const minutes = (new Date(updatedAtIso).getTime() - new Date(atIso).getTime()) / 60_000;
  return minutes >= MIN_TRUSTED_MINUTES ? minutes : undefined;
}

/**
 * Strength-training burn: kcal = MET × 3.5 × kg / 200 × minutes, where MET
 * comes from the exercise's muscle group and minutes is real elapsed time
 * when it's available (capped to MAX_MINUTES_PER_SET × setCount, so a long
 * pause or interruption can't blow the estimate up), else the flat
 * 2-min-per-set assumption. Replaced by real data once a wearable is
 * connected.
 */
/**
 * MET from actual pace, for anything done on foot, via the ACSM metabolic
 * equations. Below roughly 6.4 km/h a person walks; above it they run, and
 * running costs about twice as much oxygen per metre. This is what stops a
 * 45-minute stroll out-scoring a 15-minute run over the same distance.
 */
export function paceMet(meters: number, seconds: number): number | null {
  if (meters <= 0 || seconds <= 0) return null;
  const metresPerMin = meters / (seconds / 60);
  // Sanity bound: faster than world-record pace means the entry is wrong.
  if (metresPerMin > 400) return null;
  const vo2 = metresPerMin >= 107 ? 0.2 * metresPerMin + 3.5 : 0.1 * metresPerMin + 3.5;
  return vo2 / 3.5;
}

/** Total done-set seconds and metres in a session. */
function loggedTotals(sets: WorkoutSet[]): { seconds: number; meters: number } {
  let seconds = 0;
  let meters = 0;
  for (const s of sets) {
    if (!s.done) continue;
    seconds += s.seconds ?? 0;
    meters += s.distanceM ?? 0;
  }
  return { seconds, meters };
}

export function workoutBurn(
  setCount: number,
  bodyKg: number,
  category: MuscleGroup = 'core',
  minutes?: number,
  met = MET_BY_CATEGORY[category] ?? 5.0,
): number {
  if (setCount <= 0) return 0;
  // Real elapsed time is only a duration when it spans at least two sets.
  // A single set has no measurable length, and `updatedAt` is the last
  // *edit*, not the last work: log one set (2 min → 14 kcal), add a second
  // ten minutes later (now "10 min" → 72), delete it again — the survivor
  // was still credited the whole window, capped to 5 min → 36 kcal for the
  // exact same set it started at 14 for. Same set, same work, a number that
  // depended on edit history.
  //
  // Clamped from BELOW as well. The ceiling stopped a long interruption from
  // inflating the estimate, but nothing stopped a short window deflating it:
  // two sets logged a minute apart were credited one minute of work, less
  // than the two minutes a single set is assumed to take — so adding a set
  // dropped the day's estimate from 14 kcal to 8. The per-set assumption is
  // the floor, which makes the estimate monotonic in the work logged: more
  // sets can never mean fewer calories.
  const trustedMinutes =
    minutes != null && setCount >= 2
      ? Math.min(Math.max(minutes, DEFAULT_MINUTES_PER_SET * setCount), MAX_MINUTES_PER_SET * setCount)
      : DEFAULT_MINUTES_PER_SET * setCount;
  return Math.round(((met * 3.5 * bodyKg) / 200) * trustedMinutes);
}

/**
 * Calories for a session, counting only the sets actually marked done.
 *
 * Burning by set COUNT looked equivalent and was not: unticking an exercise
 * zeroed its burn, but then editing it — adding a set, deleting one — recomputed
 * the burn from the length of the list and quietly credited work nobody had
 * claimed to do. Reading the flag makes the two paths agree.
 */
/**
 * Calories for a session. How the work is measured decides how it is counted,
 * because "how many sets" means three different things:
 *
 * - Lifting (weight_reps, bodyweight_reps): the SET is the unit of work, so
 *   the count drives it. Ten sets is genuinely twice five sets.
 * - Holds and activities (time): the CLOCK is the unit of work. Three sets of
 *   a 60-second plank is three minutes of plank — the count only tells us how
 *   many durations to add up, it does not multiply anything. Counting sets
 *   here is what would have logged a 90-minute padel match as two minutes.
 * - Distance work (distance_time): pace decides the intensity, so the MET is
 *   derived from metres and seconds rather than assumed. See paceMet.
 */
export function burnForSets(
  sets: WorkoutSet[],
  bodyKg: number,
  category: MuscleGroup = 'core',
  minutes?: number,
  exercise?: { type?: ExerciseType; met?: number; paceModel?: 'foot' },
): number {
  const done = sets.filter((s) => s.done);
  if (done.length === 0) return 0;
  const baseMet = exercise?.met ?? MET_BY_CATEGORY[category] ?? 5.0;
  const type = exercise?.type;

  if (type === 'time' || type === 'distance_time') {
    const { seconds, meters } = loggedTotals(done);
    // Nothing timed yet (a bare checkmark) — fall back to the set assumption
    // rather than claiming zero for work that was actually done.
    if (seconds <= 0) return workoutBurn(done.length, bodyKg, category, minutes, baseMet);
    const met = (exercise?.paceModel === 'foot' ? paceMet(meters, seconds) : null) ?? baseMet;
    return Math.round(((met * 3.5 * bodyKg) / 200) * (seconds / 60));
  }

  return workoutBurn(done.length, bodyKg, category, minutes, baseMet);
}

export function burnedForDay(workouts: LoggedWorkout[], day: Date): number {
  return workouts.reduce(
    (sum, w) => (isSameDay(w.at, day) ? sum + (w.caloriesBurned ?? 0) : sum),
    0,
  );
}

/**
 * How much higher or lower a connected WHOOP's real burn tends to run
 * compared to the set/rep formula, learned from actual matched SESSIONS —
 * this is what lets a day with NO WHOOP coverage still benefit from history
 * instead of falling back to the same generic formula forever.
 *
 * Deliberately session-matched, not day-total: comparing WHOOP's whole-day
 * number against only-the-gym-sets the formula knows about is comparing two
 * different things whenever WHOOP also recorded a walk, other cardio, or
 * anything else outside a logged Calgym exercise — inflating the learned
 * ratio for reasons that have nothing to do with how accurate the gym-set
 * formula actually is (a day-total comparison that once pushed this factor
 * to its clamp ceiling and produced an 813 kcal estimate for a session
 * WHOOP itself measured at under 200). Only pairing a WHOOP-recorded
 * workout against the Calgym sets that actually overlap it — the same
 * matching whoopKcalForWorkout already does per exercise — keeps the
 * comparison apples-to-apples.
 *
 * 1 (no adjustment) until there are at least 2 usable sessions to learn
 * from, and clamped to 0.6–1.6× (tighter than before, now that the ratios
 * feeding it are trustworthy) so one outlier can't still produce a wild
 * multiplier.
 */
export function whoopCalibrationFactor(
  workouts: LoggedWorkout[],
  whoopWorkoutsByDay: Record<string, WhoopDayWorkout[]>,
  dayCount = 30,
): number {
  const ratios: number[] = [];
  // Starts at 1, not 0 — today is deliberately excluded. Its own WHOOP data
  // is still actively arriving (a live refresh or the post-training poll
  // can flip it several times before WHOOP finishes scoring), and folding a
  // day that's still changing into this average made the factor itself
  // flicker. Only settled (yesterday-or-older) days go in.
  for (let i = 1; i <= dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayWorkouts = workouts.filter((w) => isSameDay(w.at, d));
    if (dayWorkouts.length === 0) continue;
    const whoopForDay = whoopWorkoutsByDay[dateKey(d)] ?? [];
    for (const ww of whoopForDay) {
      const wStart = new Date(ww.start).getTime();
      const wEnd = new Date(ww.end).getTime();
      const overlapping = dayWorkouts.filter((w) => {
        const s = new Date(w.at).getTime() - WHOOP_MATCH_BUFFER_MS;
        const e = new Date(w.updatedAt ?? w.at).getTime() + WHOOP_MATCH_BUFFER_MS;
        return overlaps(s, e, wStart, wEnd);
      });
      const formulaSum = overlapping.reduce((sum, w) => sum + (w.caloriesBurned ?? 0), 0);
      // Too little logged for this specific session for the ratio to mean anything.
      if (formulaSum < 30) continue;
      ratios.push(ww.kcal / formulaSum);
    }
  }
  if (ratios.length < 2) return 1;
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return Math.min(1.6, Math.max(0.6, avg));
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
  whoopWorkoutsByDay: Record<string, WhoopDayWorkout[]>,
  day: Date,
): number {
  const whoopKcal = whoopBurnByDay[dateKey(day)];
  if (whoopKcal != null) return whoopKcal;
  const formula = burnedForDay(workouts, day);
  if (formula === 0) return 0;
  return Math.round(formula * whoopCalibrationFactor(workouts, whoopWorkoutsByDay));
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
 * calories are split across every logged exercise that overlaps it. The
 * split is weighted by each exercise's own formula estimate (category MET ×
 * elapsed time), not raw set count — a leg-press set and a wrist-curl set
 * don't cost the same, so they shouldn't claim equal shares of WHOOP's real
 * total just because they're both "one set". Returns null when nothing
 * overlaps, so the caller can fall back to the formula estimate outright.
 */
export function whoopKcalForWorkout(
  workout: LoggedWorkout,
  sameDayWorkouts: LoggedWorkout[],
  whoopWorkoutsForDay: WhoopDayWorkout[],
): number | null {
  if (whoopWorkoutsForDay.length === 0) return null;
  const myStart = new Date(workout.at).getTime() - WHOOP_MATCH_BUFFER_MS;
  const myEnd = new Date(workout.updatedAt ?? workout.at).getTime() + WHOOP_MATCH_BUFFER_MS;
  const myWeight = workout.caloriesBurned ?? 0;
  if (myWeight <= 0) return null;

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
    const totalWeight = sharers.reduce((n, w) => n + (w.caloriesBurned ?? 0), 0);
    if (totalWeight === 0) continue;
    matched = true;
    total += ww.kcal * (myWeight / totalWeight);
  }
  return matched ? Math.round(total) : null;
}

/**
 * The number to actually show for one logged exercise: WHOOP's real measured
 * calories when a matching WHOOP workout exists, else the stored set/rep
 * formula estimate — corrected by the same `calibration` factor
 * `actualBurnedForDay` applies to its own formula fallback, so a day's total
 * and the rows it's made of never disagree just because the day-level number
 * is calibrated and the row-level one wasn't. Mirrors `actualBurnedForDay`'s
 * "prefer WHOOP" shape at session granularity.
 */
export function actualBurnedForWorkout(
  workout: LoggedWorkout,
  sameDayWorkouts: LoggedWorkout[],
  whoopWorkoutsByDay: Record<string, WhoopDayWorkout[]>,
  calibration = 1,
): number {
  const whoop = whoopKcalForWorkout(
    workout,
    sameDayWorkouts,
    whoopWorkoutsByDay[dateKey(new Date(workout.at))] ?? [],
  );
  if (whoop != null) return whoop;
  return Math.round((workout.caloriesBurned ?? 0) * calibration);
}

/**
 * Every workout's calorie contribution for one day, with a hard ceiling:
 * when WHOOP reported a real total for that day, the sum across every
 * workout here never exceeds it. Without this, an exercise that narrowly
 * missed matching a WHOOP session (its own logged timestamps landing just
 * outside WHOOP_MATCH_BUFFER_MS) would fall back to its own separate
 * formula estimate and add that ON TOP of a day that WHOOP already fully
 * accounted for — the rows visibly summing to more than what WHOOP itself
 * measured for the exact same session. When the raw total would overshoot,
 * every workout is scaled down by the same factor, so relative shares
 * between exercises stay the same and only the absolute total is capped.
 */
export function dayBurnAllocation(
  workouts: LoggedWorkout[],
  day: Date,
  whoopBurnByDay: Record<string, number>,
  whoopWorkoutsByDay: Record<string, WhoopDayWorkout[]>,
  calibration = 1,
): Map<string, number> {
  const dayWorkouts = workouts.filter((w) => isSameDay(w.at, day));
  const raw = new Map(
    dayWorkouts.map((w) => [w.id, actualBurnedForWorkout(w, dayWorkouts, whoopWorkoutsByDay, calibration)]),
  );
  const whoopTotal = whoopBurnByDay[dateKey(day)];
  const rawSum = [...raw.values()].reduce((sum, kcal) => sum + kcal, 0);
  if (whoopTotal == null || rawSum <= whoopTotal || rawSum === 0) return raw;
  const scale = whoopTotal / rawSum;
  return new Map([...raw].map(([id, kcal]) => [id, Math.round(kcal * scale)]));
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
 * The heaviest set ever completed for an exercise, and the day it happened —
 * the record to beat. Ranked by `setScore`, so the set called "best" here is
 * the same one the trophy marks in a session and the same one the Training
 * tab prints as "Max".
 *
 * Only sets flagged `done` count. Opening a scheduled exercise pre-fills the
 * day with untrained rows, and a number nobody has lifted yet has no business
 * being anybody's record.
 */
export function bestSetEver(
  workouts: LoggedWorkout[],
  exerciseId: string,
): { set: WorkoutSet; at: string; type: LoggedWorkout['type'] } | undefined {
  let best: { set: WorkoutSet; at: string; type: LoggedWorkout['type'] } | undefined;
  let bestScore = 0;
  for (const w of workouts) {
    if (w.exerciseId !== exerciseId) continue;
    for (const s of w.sets) {
      if (!s.done) continue;
      const score = setScore(s, w.type);
      if (score > bestScore) {
        bestScore = score;
        best = { set: s, at: w.at, type: w.type };
      }
    }
  }
  return best;
}

/**
 * The most recent set at a given rep count — the only like-for-like reference
 * while you are choosing a weight. 25 kg × 10 against 25 kg × 7 is not a
 * comparison; 25 kg × 10 against the last time you did ten is.
 *
 * Within that session the *heaviest* set at the rep count wins, because what
 * you want to know is what you can hold for ten, not whichever ten happened to
 * come last after the others had already emptied you.
 *
 * When that rep count has never been done, the nearest one that has is
 * returned along with its own rep count, for the caller to label honestly: a
 * weight printed under "× 10" that was really a set of six would be worse than
 * printing nothing.
 */
export function lastSetAtReps(
  workouts: LoggedWorkout[],
  exerciseId: string,
  reps: number,
): { set: WorkoutSet; at: string; reps: number } | undefined {
  const sessions = historyFor(workouts, exerciseId)
    .map((w) => ({ at: w.at, sets: w.sets.filter((s) => s.done && (s.reps ?? 0) > 0) }))
    .filter((w) => w.sets.length > 0);
  if (sessions.length === 0) return undefined;

  const counts = new Set<number>();
  for (const w of sessions) for (const s of w.sets) counts.add(s.reps as number);
  // Ties go to the lower rep count: heavier and closer to a working set than
  // the same distance above, which is usually a lighter, longer one.
  const want = counts.has(reps)
    ? reps
    : [...counts].reduce((a, b) => {
        const da = Math.abs(a - reps);
        const db = Math.abs(b - reps);
        return db < da || (db === da && b < a) ? b : a;
      });

  for (const w of sessions) {
    const matches = w.sets.filter((s) => s.reps === want);
    if (matches.length === 0) continue;
    const set = matches.reduce((b, s) => ((s.weightKg ?? 0) > (b.weightKg ?? 0) ? s : b));
    return { set, at: w.at, reps: want };
  }
  return undefined;
}

/**
 * The most recent session of an exercise strictly before `day` — what you
 * actually did last time.
 *
 * Strictly earlier, not merely "a different day": filtering on "not this day"
 * also sweeps in later sessions, so looking back at a day you missed would
 * show it numbers from a workout that had not happened yet.
 */
export function lastSessionBefore(
  workouts: LoggedWorkout[],
  exerciseId: string,
  day: Date,
): LoggedWorkout | undefined {
  const dayStart = startOfDay(day).getTime();
  return historyFor(workouts, exerciseId).find((w) => new Date(w.at).getTime() < dayStart);
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

/**
 * Consecutive days with at least one completed fast, counted by the day it
 * ended — same "ending today counts, otherwise ending yesterday" shape as
 * streakDays/workoutStreakDays above, so a streak doesn't drop to 0 the
 * instant the calendar rolls over.
 */
export function fastingStreakDays(history: FastingSession[]): number {
  const ended = history.filter((f) => f.endedAt);
  let streak = 0;
  const day = new Date();
  if (!ended.some((f) => isSameDay(f.endedAt!, day))) day.setDate(day.getDate() - 1);
  for (;;) {
    if (ended.some((f) => isSameDay(f.endedAt!, day))) {
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

/** Body-mass index for a weight/height pair (kg, cm). */
export function bmiFor(kg: number, heightCm: number): number {
  const m = heightCm / 100;
  return kg / (m * m);
}

export type MetricTrend = 'good' | 'bad' | 'neutral';

/** Colors a change in some direction as good/bad/neutral, given which
 * direction ('up' or 'down') counts as improvement. Small noise below
 * `threshold` reads as neutral rather than flip-flopping on tiny deltas. */
function trendFor(delta: number, goodDirection: 'up' | 'down', threshold = 0.05): MetricTrend {
  if (Math.abs(delta) < threshold) return 'neutral';
  const wentUp = delta > 0;
  return (goodDirection === 'up') === wentUp ? 'good' : 'bad';
}

/** Weight trend depends on the user's goal: losing wants it down, gaining
 * wants it up, and maintaining has no "good" direction — just neutral. */
export function weightTrend(deltaKg: number, goal: Goal): MetricTrend {
  if (goal === 'maintain') return 'neutral';
  return trendFor(deltaKg, goal === 'lose' ? 'down' : 'up');
}

/** BMI is a direct function of weight (kg / height²), so it follows the
 * same goal-based direction weight itself does — losing wants it down,
 * gaining wants it up, maintaining has no "good" direction either way. */
export function bmiTrend(deltaBmi: number, goal: Goal): MetricTrend {
  return weightTrend(deltaBmi, goal);
}

/** Body fat: down is always the improving direction. */
export function bodyFatTrend(deltaPercent: number): MetricTrend {
  return trendFor(deltaPercent, 'down');
}

/** Muscle mass share of body weight: up is always the improving direction. */
export function muscleTrend(deltaPercent: number): MetricTrend {
  return trendFor(deltaPercent, 'up');
}

/** Weight/BMI/body-fat/muscle plus each one's delta and colored trend
 * against `previous` — the same computation the Overview weight card and
 * body-reading's own summary row both need, kept in one place so they can't
 * quietly drift out of sync with each other. `previous` doesn't have to be
 * literally adjacent in the weights array — the caller decides what
 * "before this one" means (the prior saved entry, the one before a loaded
 * historical reading, etc.). */
export interface BodyStats {
  weightKg: number;
  bmi: number;
  bodyFatPercent?: number;
  musclePercent?: number;
  weightDelta?: number;
  bmiDelta?: number;
  bodyFatDelta?: number;
  muscleDelta?: number;
  weightTrend: MetricTrend;
  bmiTrend: MetricTrend;
  bodyFatTrend: MetricTrend;
  muscleTrend: MetricTrend;
}

export function bodyStatsFor(entry: WeightEntry, previous: WeightEntry | undefined, profile: Profile): BodyStats {
  const bmi = bmiFor(entry.kg, profile.heightCm);
  const previousBmi = previous ? bmiFor(previous.kg, profile.heightCm) : undefined;
  const weightDelta = previous ? entry.kg - previous.kg : undefined;
  const bmiDelta = previousBmi != null ? bmi - previousBmi : undefined;
  const bodyFatDelta =
    entry.bodyFatPercent != null && previous?.bodyFatPercent != null
      ? entry.bodyFatPercent - previous.bodyFatPercent
      : undefined;
  const musclePercent = entry.skeletalMuscleMassKg != null ? (entry.skeletalMuscleMassKg / entry.kg) * 100 : undefined;
  const previousMusclePercent =
    previous?.skeletalMuscleMassKg != null && previous.kg ? (previous.skeletalMuscleMassKg / previous.kg) * 100 : undefined;
  const muscleDelta =
    musclePercent != null && previousMusclePercent != null ? musclePercent - previousMusclePercent : undefined;
  return {
    weightKg: entry.kg,
    bmi,
    bodyFatPercent: entry.bodyFatPercent,
    musclePercent,
    weightDelta,
    bmiDelta,
    bodyFatDelta,
    muscleDelta,
    weightTrend: weightDelta != null ? weightTrend(weightDelta, profile.goal) : 'neutral',
    bmiTrend: bmiDelta != null ? bmiTrend(bmiDelta, profile.goal) : 'neutral',
    bodyFatTrend: bodyFatDelta != null ? bodyFatTrend(bodyFatDelta) : 'neutral',
    muscleTrend: muscleDelta != null ? muscleTrend(muscleDelta) : 'neutral',
  };
}

/** Same shape as `bodyStatsFor`, but for the Overview "as of a viewed day"
 * card: weight/BMI come from the single most recent entry on or before
 * `asOf`, while body fat % and muscle % are each backfilled independently
 * from the most recent entry (on or before `asOf`) that actually carries
 * that field — a quick weight-only log shouldn't blank out fat/muscle
 * numbers that are still the best data we have. `weights` must be sorted
 * most-recent-first. */
export function overviewBodyStats(weights: WeightEntry[], asOf: Date, profile: Profile): BodyStats | undefined {
  const cutoff = new Date(asOf);
  cutoff.setHours(23, 59, 59, 999);
  const upToDate = weights.filter((w) => new Date(w.at).getTime() <= cutoff.getTime());
  const latest = upToDate[0];
  if (!latest) return undefined;
  const previous = upToDate[1];
  const bmi = bmiFor(latest.kg, profile.heightCm);
  const previousBmi = previous ? bmiFor(previous.kg, profile.heightCm) : undefined;
  const weightDelta = previous ? latest.kg - previous.kg : undefined;
  const bmiDelta = previousBmi != null ? bmi - previousBmi : undefined;

  const fatEntries = upToDate.filter((w) => w.bodyFatPercent != null);
  const bodyFatPercent = fatEntries[0]?.bodyFatPercent;
  const bodyFatDelta =
    bodyFatPercent != null && fatEntries[1]?.bodyFatPercent != null ? bodyFatPercent - fatEntries[1].bodyFatPercent : undefined;

  const muscleEntries = upToDate
    .filter((w) => w.skeletalMuscleMassKg != null && w.kg)
    .map((w) => (w.skeletalMuscleMassKg! / w.kg) * 100);
  const musclePercent = muscleEntries[0];
  const muscleDelta = musclePercent != null && muscleEntries[1] != null ? musclePercent - muscleEntries[1] : undefined;

  return {
    weightKg: latest.kg,
    bmi,
    bodyFatPercent,
    musclePercent,
    weightDelta,
    bmiDelta,
    bodyFatDelta,
    muscleDelta,
    weightTrend: weightDelta != null ? weightTrend(weightDelta, profile.goal) : 'neutral',
    bmiTrend: bmiDelta != null ? bmiTrend(bmiDelta, profile.goal) : 'neutral',
    bodyFatTrend: bodyFatDelta != null ? bodyFatTrend(bodyFatDelta) : 'neutral',
    muscleTrend: muscleDelta != null ? muscleTrend(muscleDelta) : 'neutral',
  };
}

/**
 * The meal the plan has in mind for `slot` on `day`, after any swap the
 * user made for that day. A swap that points at a weekday whose plan has
 * nothing in that slot falls back to the day's own meal.
 */
export function plannedMealFor(
  plan: MealPlan | undefined,
  day: Date,
  slot: MealType,
  swaps: Record<string, Partial<Record<MealType, number>>>,
  /** Recipe standing in for a slot on a specific date, and the saved recipes
   * to resolve it against. Both optional, so callers that predate recipes
   * behave exactly as before. */
  recipeOverrides?: Record<
    string,
    Partial<Record<MealType, { recipeId: string; servings: number; programId?: string }>>
  >,
  recipes?: Recipe[],
  /** The programme currently in force. An override stamped with a different
   * one is ignored, so a replacement never lands on another plan's meal. */
  activeProgramId?: string,
): PlannedMeal | undefined {
  // A recipe put on this slot wins over both the swap and the programme's own
  // meal — it is the most specific thing the person asked for, for this date.
  const override = recipeOverrides?.[dateKey(day)]?.[slot];
  const overrideApplies =
    !!override && (override.programId == null || override.programId === activeProgramId);
  if (override && overrideApplies && recipes) {
    const recipe = recipes.find((r) => r.id === override.recipeId);
    // A recipe since deleted falls through to the plan rather than blanking
    // the slot: the programme's own meal is a better answer than nothing.
    if (recipe) return plannedMealFromRecipe(recipe, slot, override.servings);
  }
  if (!plan) return undefined;
  const find = (weekday: number) =>
    plan.days.find((d) => d.weekday === weekday)?.meals.find((m) => m.slot === slot);
  const swapped = swaps[dateKey(day)]?.[slot];
  return (swapped != null ? find(swapped) : undefined) ?? find(day.getDay());
}

/**
 * Every planned meal in a date range that a recipe actually stands behind.
 *
 * A programme meal with no recipe has no ingredients, so it cannot be shopped
 * for — those are counted separately rather than silently dropped, because
 * "6 of 14 planned meals have a recipe" is the honest thing to show before
 * someone trusts a list.
 */
export function plannedRecipeMealsBetween(
  fromKey: string,
  toKey: string,
  overrides: AppState['mealPlanRecipes'],
  recipes: Recipe[],
  mealPlan: MealPlan | undefined,
  activeProgramId: string | undefined,
): { meals: PlannedRecipeMeal[]; plannedTotal: number } {
  const meals: PlannedRecipeMeal[] = [];
  let plannedTotal = 0;
  for (const day of datesBetween(fromKey, toKey)) {
    const key = dateKey(day);
    const slots = mealPlan?.days.find((d) => d.weekday === day.getDay())?.meals ?? [];
    plannedTotal += slots.length;
    const dayOverrides = overrides[key];
    if (!dayOverrides) continue;
    for (const [slot, entry] of Object.entries(dayOverrides)) {
      if (!entry) continue;
      if (entry.programId != null && entry.programId !== activeProgramId) continue;
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      meals.push({
        dayKey: key,
        slot: slot as MealType,
        recipe,
        servings: entry.servings,
        batchId: entry.batchId,
      });
    }
  }
  return { meals, plannedTotal };
}

/** Inclusive list of dates from one dateKey to another, capped so a bad range
 * can never spin. */
export function datesBetween(fromKey: string, toKey: string): Date[] {
  // dateKey's month is getMonth() — already zero-based — so it feeds straight
  // into the Date constructor. Subtracting one here shifted every range back a
  // month and quietly matched nothing.
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const start = new Date(fy, fm, fd);
  const end = new Date(ty, tm, td);
  const out: Date[] = [];
  for (let d = new Date(start); d <= end && out.length < 60; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

/** A recipe portion expressed as a planned meal, so every screen that already
 * renders the plan renders this too without knowing recipes exist. */
export function plannedMealFromRecipe(
  recipe: Recipe,
  slot: MealType,
  servings: number,
): PlannedMeal {
  const m = roundMacros(scaleMacros(perServing(recipe), servings));
  return {
    slot,
    name: recipe.name,
    items: [
      {
        name: recipe.name,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        portion: `${servingCountLabel(servings)}`,
        recipeId: recipe.id,
        recipeServings: servings,
      },
    ],
  };
}

/** Every distinct planned meal for `slot` across the week, in weekday
 * order, deduplicated by name — the candidates a swap can pick from. */
export function plannedMealOptions(plan: MealPlan, slot: MealType): { weekday: number; meal: PlannedMeal }[] {
  const seen = new Set<string>();
  const out: { weekday: number; meal: PlannedMeal }[] = [];
  for (const d of plan.days) {
    const meal = d.meals.find((m) => m.slot === slot);
    if (!meal || seen.has(meal.name)) continue;
    seen.add(meal.name);
    out.push({ weekday: d.weekday, meal });
  }
  return out;
}

export function plannedMealCalories(meal: PlannedMeal): number {
  return meal.items.reduce((sum, i) => sum + i.calories, 0);
}

/** Meal types already logged on `day`. */
export function mealTypesLogged(meals: LoggedMeal[], day: Date): Set<MealType> {
  const set = new Set<MealType>();
  for (const m of meals) {
    if (isSameDay(m.at, day)) set.add(m.mealType ?? 'snack');
  }
  return set;
}
