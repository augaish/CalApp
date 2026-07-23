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

export interface LoggedWorkout {
  id: string;
  at: string;
  equipmentName: string;
  sets?: number;
  reps?: string;
}
