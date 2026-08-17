import type { FoodItem, LoggedMeal } from './types';

/**
 * Fold away the spelling differences that stop an Arabic search from matching
 * what the user actually typed: harakat, the alef and yaa variants, and the
 * taa marbuta. "بطاطس" typed without hamza should still find "بَطاطِس".
 */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/**
 * Distinct foods the user has logged before, most recently eaten first. One
 * entry per name — logging the same food ten times should offer it once, with
 * the macros from the latest time, since that is the version they corrected.
 */
export function pastFoods(meals: LoggedMeal[]): FoodItem[] {
  const byName = new Map<string, FoodItem>();
  const newestFirst = [...meals].sort((a, b) => b.at.localeCompare(a.at));
  for (const meal of newestFirst) {
    for (const item of meal.items) {
      const key = normalize(item.name);
      if (!key || byName.has(key)) continue;
      byName.set(key, item);
    }
  }
  return [...byName.values()];
}

/**
 * Foods worth offering for a half-typed name. Prefix matches come first — after
 * typing "ba" the user means Banana, not "Kebab with rice" — and an empty query
 * suggests nothing, so the field stays quiet until they start typing.
 */
export function suggestFoods(history: FoodItem[], query: string, limit = 5): FoodItem[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const starts: FoodItem[] = [];
  const contains: FoodItem[] = [];
  for (const item of history) {
    const name = normalize(item.name);
    if (name === q) continue; // already typed in full — nothing to suggest
    if (name.startsWith(q)) starts.push(item);
    else if (name.includes(q)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}
