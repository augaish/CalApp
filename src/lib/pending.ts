import { create } from 'zustand';

import type { EquipmentAnalysis, MealAnalysis } from './types';

/** Transient (non-persisted) hand-off between the scan screen and result screens. */
interface PendingState {
  meal: MealAnalysis | null;
  equipment: EquipmentAnalysis | null;
  photoUri: string | null;
  /** A plain photo captured for the manual food-entry form. */
  capturedPhoto: string | null;
  setMeal: (meal: MealAnalysis, photoUri: string | null) => void;
  setEquipment: (equipment: EquipmentAnalysis, photoUri: string | null) => void;
  setCapturedPhoto: (uri: string | null) => void;
  clear: () => void;
}

export const usePending = create<PendingState>((set) => ({
  meal: null,
  equipment: null,
  photoUri: null,
  capturedPhoto: null,
  setMeal: (meal, photoUri) => set({ meal, photoUri, equipment: null }),
  setEquipment: (equipment, photoUri) => set({ equipment, photoUri, meal: null }),
  setCapturedPhoto: (uri) => set({ capturedPhoto: uri }),
  clear: () => set({ meal: null, equipment: null, photoUri: null }),
}));
