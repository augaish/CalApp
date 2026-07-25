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
}

export interface MealAnalysis {
  items: FoodItem[];
  /** 0–1, how confident the model is overall */
  confidence: number;
  notes?: string;
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

export interface WeightEntry {
  at: string;
  kg: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

/** Muscle group a training exercise belongs to (library categories). */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'core'
  | 'forearms'
  | 'cardio'
  | 'fullBody';

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
