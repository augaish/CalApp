export type Language = 'en' | 'ar';

export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type Goal = 'lose' | 'maintain' | 'gain';

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface DailyTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodItem {
  /** Dish name in the user's language */
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** e.g. "1 cup", "200 g" — in the user's language */
  portion: string;
  /**
   * Per-100g macros. Set for barcode / packaged items so the user can enter
   * how many grams they actually ate and have the macros scale automatically.
   */
  basePer100?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  /** Grams eaten — drives scaling when `basePer100` is present. */
  gramsEaten?: number;
}

export interface MealAnalysis {
  items: FoodItem[];
  /** 0–1, how confident the model is overall */
  confidence: number;
  notes?: string;
  /** Domains a restaurant/product lookup actually checked, e.g. "mcdonalds.com". */
  sources?: string[];
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface LoggedMeal {
  id: string;
  /** ISO date-time when logged */
  at: string;
  items: FoodItem[];
  photoUri?: string;
  mealType?: MealType;
}

/** Lean mass per body region (kg), as broken down by a bioimpedance/InBody-style
 * scan. Optional per-region — most manual entries and many scan models won't
 * have all five. */
export interface SegmentalLeanMass {
  leftArm?: number;
  rightArm?: number;
  trunk?: number;
  leftLeg?: number;
  rightLeg?: number;
}

export interface WeightEntry {
  at: string;
  kg: number;
  /** The fuller reading fields below are optional — a quick Overview weigh-in
   * only ever sets `kg`; a full body reading (manual or scanned) can add the
   * rest. */
  bodyFatPercent?: number;
  skeletalMuscleMassKg?: number;
  segmentalLeanMassKg?: SegmentalLeanMass;
  source?: 'manual' | 'scan';
  /** Device/brand read off a scanned report, e.g. "InBody 270" — display only. */
  reportLabel?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** A proposed weekly schedule, rendered as a card the user can add with one tap. */
  schedulePlan?: CoachSchedulePlan;
}

/** One exercise inside a day the coach proposed — sets and reps only, no weight
 * (the coach has no way to know what the user can lift). */
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

/** A weekly training plan the coach proposed, awaiting the user's tap to add it. */
export interface CoachSchedulePlan {
  summary?: string;
  days: CoachScheduleDay[];
}

/**
 * A full AI-designed program: calorie/macro targets plus a weekly schedule
 * that work toward one goal together, over a set duration. Distinct from a
 * bare CoachSchedulePlan (which only ever proposes the schedule half) — the
 * accept flow commits both `targets` and `schedule` in one step.
 */
export interface Program {
  id: string;
  createdAt: string;
  goal: Goal;
  durationWeeks: number;
  summary: string;
  targets: DailyTargets;
  schedule: CoachSchedulePlan;
}

/** What the server hands back before the user has accepted it — everything
 * a Program has except the bookkeeping fields (id/createdAt/goal) the store
 * adds on acceptance. */
export type GeneratedProgram = Pick<Program, 'summary' | 'durationWeeks' | 'targets' | 'schedule'>;

export interface EquipmentAnalysis {
  /** Machine name in the user's language */
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  setupSteps: string[];
  formCues: string[];
  commonMistakes: string[];
  suggestion: { sets: number; reps: string; note?: string };
  confidence: number;
}

/**
 * Extracted (never estimated) from a photo of a body-composition report —
 * InBody, Tanita, DEXA or similar. Every field is null when the report
 * simply doesn't print that number; nothing here is a visual guess.
 */
export interface BodyReadingAnalysis {
  deviceLabel?: string;
  weightKg?: number;
  bodyFatPercent?: number;
  skeletalMuscleMassKg?: number;
  segmentalLeanMassKg?: SegmentalLeanMass;
  confidence: number;
}

/** Muscle group a training exercise belongs to (library categories). */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'calves'
  | 'glutes'
  | 'core'
  | 'forearms'
  | 'cardio'
  | 'fullBody';

/**
 * A specific muscle, finer-grained than MuscleGroup — used only to drive the
 * muscle-map illustration on a single exercise's detail page (which exact
 * muscle lights up, and how strongly), never for library browsing/filtering.
 * That stays on MuscleGroup/category, which is coarser on purpose.
 */
export type MuscleId =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lats'
  | 'traps'
  | 'rhomboids'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'hip_flexors'
  | 'calves';

/** How each set of an exercise is measured. */
export type ExerciseType = 'weight_reps' | 'bodyweight_reps' | 'time' | 'distance_time';

/** A reusable exercise definition — built-in seed, user-made, or saved from a scan. */
export interface Exercise {
  id: string;
  /** Display name in its origin language (fallback when a localized name is absent). */
  name: string;
  nameEn?: string;
  nameAr?: string;
  category: MuscleGroup;
  /**
   * Precise muscles this exercise targets, for the muscle-map illustration.
   * Falls back to `category` (shown at full strength, no secondary) when
   * absent — e.g. for cardio, "it depends" holds like Iso Hold, or any
   * custom/scanned exercise that never got this level of detail.
   */
  primaryMuscles?: MuscleId[];
  secondaryMuscles?: MuscleId[];
  type: ExerciseType;
  /** Photo of the machine/movement — from the camera or an equipment scan. */
  photoUri?: string;
  /** Form cues / how-to, shown on the exercise page. */
  description?: string;
  videoUrl?: string;
  /** Alternate names used to match a scanned machine to this entry (built-ins). */
  aliases?: string[];
  source: 'builtin' | 'custom' | 'scan';
}

/** One recorded set inside a logged exercise. */
/** A target set defined ahead of time in the weekly schedule (no "done"). */
export interface PlannedSet {
  weightKg?: number;
  reps?: number;
  seconds?: number;
  distanceM?: number;
}

export interface WorkoutSet {
  weightKg?: number;
  reps?: number;
  /** For time-based exercises (planks, cardio holds). */
  seconds?: number;
  /** For distance/time exercises (running, rowing). */
  distanceM?: number;
  done: boolean;
  /** Free note, e.g. a progressive-overload reminder for next session. */
  comment?: string;
  /** True when this set beat the previous best for the exercise. */
  isPR?: boolean;
}

/** One exercise recorded on a given day, with its individual sets. */
export interface LoggedWorkout {
  id: string;
  at: string;
  exerciseId: string;
  /** Snapshot of the name at log time (survives exercise edits/deletes). */
  exerciseName: string;
  type: ExerciseType;
  sets: WorkoutSet[];
  /** Rough estimate, kcal */
  caloriesBurned?: number;
}

/** One workout WHOOP detected on a given day (real heart-rate-based numbers, not an estimate). */
export interface WhoopDayWorkout {
  sportName: string;
  start: string;
  end: string;
  kcal: number;
  strain: number | null;
  avgHeartRate: number | null;
}
