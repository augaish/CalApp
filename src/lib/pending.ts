import { create } from 'zustand';

import type { BodyReadingAnalysis, EquipmentAnalysis, FoodItem, MealAnalysis, MealType } from './types';

/** Transient (non-persisted) hand-off between the scan screen and result screens. */
interface PendingState {
  meal: MealAnalysis | null;
  equipment: EquipmentAnalysis | null;
  bodyReading: BodyReadingAnalysis | null;
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
  /**
   * S16 opt-in: share a product the catalogue lacked for review, once it is
   * saved. Off by default and never submits on its own — the save that follows
   * (label photo or manual entry) reads it. Cleared after use.
   */
  catalogueConsent: boolean;
  /** A food picked from search (S29 entry), consumed once by the manual form. */
  foodDraft: FoodItem | null;
  /** The last S42 move/skip, so Training can offer Undo until it is started or changed. */
  lastOccurrenceOp: { opId: string; label: string } | null;
  setMeal: (meal: MealAnalysis, photoUri: string | null) => void;
  setEquipment: (equipment: EquipmentAnalysis, photoUri: string | null) => void;
  setBodyReading: (reading: BodyReadingAnalysis, photoUri: string | null) => void;
  setCapturedPhoto: (uri: string | null) => void;
  setMealTypeHint: (hint: MealType | null) => void;
  consumeMealTypeHint: () => MealType | null;
  setCatalogueConsent: (on: boolean) => void;
  consumeCatalogueConsent: () => boolean;
  setFoodDraft: (item: FoodItem | null) => void;
  consumeFoodDraft: () => FoodItem | null;
  setLastOccurrenceOp: (op: { opId: string; label: string } | null) => void;
  clear: () => void;
}

export const usePending = create<PendingState>((set, get) => ({
  meal: null,
  equipment: null,
  bodyReading: null,
  photoUri: null,
  capturedPhoto: null,
  mealTypeHint: null,
  catalogueConsent: false,
  foodDraft: null,
  lastOccurrenceOp: null,
  setMeal: (meal, photoUri) => set({ meal, photoUri, equipment: null, bodyReading: null }),
  setEquipment: (equipment, photoUri) => set({ equipment, photoUri, meal: null, bodyReading: null }),
  setBodyReading: (bodyReading, photoUri) => set({ bodyReading, photoUri, meal: null, equipment: null }),
  setCapturedPhoto: (uri) => set({ capturedPhoto: uri }),
  setMealTypeHint: (hint) => set({ mealTypeHint: hint }),
  consumeMealTypeHint: () => {
    const hint = get().mealTypeHint;
    if (hint) set({ mealTypeHint: null });
    return hint;
  },
  setCatalogueConsent: (on) => set({ catalogueConsent: on }),
  consumeCatalogueConsent: () => {
    const on = get().catalogueConsent;
    if (on) set({ catalogueConsent: false });
    return on;
  },
  setFoodDraft: (item) => set({ foodDraft: item }),
  setLastOccurrenceOp: (op) => set({ lastOccurrenceOp: op }),
  consumeFoodDraft: () => {
    const item = get().foodDraft;
    if (item) set({ foodDraft: null });
    return item;
  },
  clear: () => set({ meal: null, equipment: null, bodyReading: null, photoUri: null }),
}));
