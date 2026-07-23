import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dailyTargets } from './tdee';
import type {
  DailyTargets,
  FoodItem,
  Language,
  LoggedMeal,
  LoggedWorkout,
  MealType,
  Profile,
  WeightEntry,
} from './types';

export interface WaterEntry {
  at: string;
  ml: number;
}

interface AppState {
  language: Language | null;
  profile: Profile | null;
  targets: DailyTargets | null;
  meals: LoggedMeal[];
  workouts: LoggedWorkout[];
  water: WaterEntry[];
  weights: WeightEntry[];
  remindMeals: boolean;
  remindWater: boolean;
  hydrated: boolean;

  setLanguage: (language: Language) => void;
  setProfile: (profile: Profile) => void;
  logMeal: (items: FoodItem[], photoUri?: string, mealType?: MealType) => void;
  removeMeal: (id: string) => void;
  logWorkout: (equipmentName: string, sets?: number, reps?: string) => void;
  logWater: (ml: number) => void;
  logWeight: (kg: number) => void;
  setRemindMeals: (on: boolean) => void;
  setRemindWater: (on: boolean) => void;
  setHydrated: () => void;
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
    (set) => ({
      language: null,
      profile: null,
      targets: null,
      meals: [],
      workouts: [],
      water: [],
      weights: [],
      remindMeals: false,
      remindWater: false,
      hydrated: false,

      setLanguage: (language) => set({ language }),
      setProfile: (profile) => set({ profile, targets: dailyTargets(profile) }),
      logMeal: (items, photoUri, mealType) =>
        set((s) => ({
          meals: [
            {
              id: id(),
              at: new Date().toISOString(),
              items,
              photoUri,
              mealType: mealType ?? mealTypeForNow(),
            },
            ...s.meals,
          ],
        })),
      removeMeal: (mealId) => set((s) => ({ meals: s.meals.filter((m) => m.id !== mealId) })),
      logWorkout: (equipmentName, sets, reps) =>
        set((s) => ({
          workouts: [
            { id: id(), at: new Date().toISOString(), equipmentName, sets, reps },
            ...s.workouts,
          ],
        })),
      logWater: (ml) =>
        set((s) => ({ water: [{ at: new Date().toISOString(), ml }, ...s.water] })),
      logWeight: (kg) =>
        set((s) => ({ weights: [{ at: new Date().toISOString(), kg }, ...s.weights] })),
      setRemindMeals: (on) => set({ remindMeals: on }),
      setRemindWater: (on) => set({ remindWater: on }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'calapp-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        language,
        profile,
        targets,
        meals,
        workouts,
        water,
        weights,
        remindMeals,
        remindWater,
      }) => ({
        language,
        profile,
        targets,
        meals,
        workouts,
        water,
        weights,
        remindMeals,
        remindWater,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

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
