import { create } from 'zustand';

import type { EquipmentAnalysis, MealAnalysis, MealType } from './types';

/** Transient (non-persisted) hand-off between the scan screen and result screens. */
interface PendingState {
  meal: MealAnalysis | null;
  equipment: EquipmentAnalysis | null;
  photoUri: string | null;
  /** A plain photo captured for the manual food-entry form. */
  capturedPhoto: string | null;
  /**
   * Which meal slot the user tapped "+" next to (Food tab section headers),
   * so every entry point this opens into — scan, describe, manual, barcode —
   * defaults to that slot instead of guessing from the current time. Read
   * once via `consumeMealTypeHint` so it never leaks into a later, unrelated
   * add flow (e.g. the tab-bar + button, which has no slot in mind).
   */
  mealTypeHint: MealType | null;
  setMeal: (meal: MealAnalysis, photoUri: string | null) => void;
  setEquipment: (equipment: EquipmentAnalysis, photoUri: string | null) => void;
  setCapturedPhoto: (uri: string | null) => void;
  setMealTypeHint: (hint: MealType | null) => void;
  consumeMealTypeHint: () => MealType | null;
  clear: () => void;
}

export const usePending = create<PendingState>((set, get) => ({
  meal: null,
  equipment: null,
  photoUri: null,
  capturedPhoto: null,
  mealTypeHint: null,
  setMeal: (meal, photoUri) => set({ meal, photoUri, equipment: null }),
  setEquipment: (equipment, photoUri) => set({ equipment, photoUri, meal: null }),
  setCapturedPhoto: (uri) => set({ capturedPhoto: uri }),
  setMealTypeHint: (hint) => set({ mealTypeHint: hint }),
  consumeMealTypeHint: () => {
    const hint = get().mealTypeHint;
    if (hint) set({ mealTypeHint: null });
    return hint;
  },
  clear: () => set({ meal: null, equipment: null, photoUri: null }),
}));
