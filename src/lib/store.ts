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
  Profile,
} from './types';

interface AppState {
  language: Language | null;
  profile: Profile | null;
  targets: DailyTargets | null;
  meals: LoggedMeal[];
  workouts: LoggedWorkout[];
  hydrated: boolean;

  setLanguage: (language: Language) => void;
  setProfile: (profile: Profile) => void;
  logMeal: (items: FoodItem[], photoUri?: string) => void;
  removeMeal: (id: string) => void;
  logWorkout: (equipmentName: string, sets?: number, reps?: string) => void;
  setHydrated: () => void;
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
      hydrated: false,

      setLanguage: (language) => set({ language }),
      setProfile: (profile) => set({ profile, targets: dailyTargets(profile) }),
      logMeal: (items, photoUri) =>
        set((s) => ({
          meals: [{ id: id(), at: new Date().toISOString(), items, photoUri }, ...s.meals],
        })),
      removeMeal: (mealId) => set((s) => ({ meals: s.meals.filter((m) => m.id !== mealId) })),
      logWorkout: (equipmentName, sets, reps) =>
        set((s) => ({
          workouts: [
            { id: id(), at: new Date().toISOString(), equipmentName, sets, reps },
            ...s.workouts,
          ],
        })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'calapp-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, profile, targets, meals, workouts }) => ({
        language,
        profile,
        targets,
        meals,
        workouts,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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

export function todayTotals(meals: LoggedMeal[]): DayTotals {
  const totals: DayTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const meal of meals) {
    if (!isToday(meal.at)) continue;
    for (const item of meal.items) {
      totals.calories += item.calories;
      totals.proteinG += item.proteinG;
      totals.carbsG += item.carbsG;
      totals.fatG += item.fatG;
    }
  }
  return totals;
}
