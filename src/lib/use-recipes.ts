import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { findRecipe, mergeRecipes } from './starter-recipes';
import { useAppStore } from './store';
import type { Language, Recipe } from './types';

/** Saved recipes plus the uncopied Calgym starters, in the current language. */
export function useAllRecipes(): Recipe[] {
  const { i18n } = useTranslation();
  const lang: Language = i18n.language === 'ar' ? 'ar' : 'en';
  const saved = useAppStore((s) => s.recipes);
  const favoriteIds = useAppStore((s) => s.favoriteIds);
  return useMemo(() => mergeRecipes(saved, lang, favoriteIds), [saved, lang, favoriteIds]);
}

/**
 * A starter becomes a private copy the moment it is written to — planned,
 * logged, kept or edited — so store writes always have a row to land on
 * and the bundled original stays untouched (AT45). Returns the recipe now
 * in the store, or undefined when the id is unknown.
 */
export function ensureRecipeInStore(id: string, lang: Language): Recipe | undefined {
  const state = useAppStore.getState();
  const existing = state.recipes.find((r) => r.id === id);
  if (existing) return existing;
  const starter = findRecipe(id, [], lang);
  if (!starter) return undefined;
  const { id: sid, createdAt, ...rest } = starter;
  state.addRecipe({ ...rest, id: sid, createdAt: new Date().toISOString() });
  return useAppStore.getState().recipes.find((r) => r.id === id);
}
