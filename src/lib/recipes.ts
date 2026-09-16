import type { FoodItem, Recipe, RecipeIngredient } from './types';

/**
 * Everything numeric about a recipe.
 *
 * The AI supplies per-ingredient estimates; this file does all the arithmetic
 * on top of them. That division matters, and so does its limit: exact
 * arithmetic over estimated inputs still gives an estimated total. The screens
 * say so rather than implying a precision these numbers do not have.
 */

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const ZERO: Macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    calories: m.calories * factor,
    proteinG: m.proteinG * factor,
    carbsG: m.carbsG * factor,
    fatG: m.fatG * factor,
  };
}

/** Rounded for display only — never fed back into another calculation, or the
 * rounding compounds across ingredients. */
export function roundMacros(m: Macros): Macros {
  return {
    calories: Math.round(m.calories),
    proteinG: Math.round(m.proteinG),
    carbsG: Math.round(m.carbsG),
    fatG: Math.round(m.fatG),
  };
}

/** The whole batch, as written. */
export function recipeTotals(recipe: Pick<Recipe, 'ingredients'>): Macros {
  return recipe.ingredients.reduce(
    (sum, i) => addMacros(sum, { calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG }),
    ZERO,
  );
}

/** One serving of the batch as written. The number shown most prominently,
 * because it is the one a person eats. */
export function perServing(recipe: Pick<Recipe, 'ingredients' | 'servings'>): Macros {
  const servings = Math.max(1, recipe.servings || 1);
  return scaleMacros(recipeTotals(recipe), 1 / servings);
}

/**
 * Whether this recipe's nutrition is estimated.
 *
 * Decided by where the numbers CAME FROM, not by how sure the model sounded.
 * Anything an AI wrote stays estimated until someone verifies it — a
 * confident guess is still a guess, and letting confidence clear the flag
 * would quietly turn the least reliable figures into the ones shown without
 * a caveat.
 */
export function isEstimated(recipe: Pick<Recipe, 'ingredients' | 'source'>): boolean {
  return recipe.source === 'ai' || recipe.ingredients.some((i) => i.estimated);
}

/**
 * The ingredient list for a different batch size.
 *
 * "Cooking for" is deliberately NOT the same question as "how much did I
 * eat" — this scales the shopping and the pan, and nothing else. Doubling the
 * batch must never double what goes in the diary.
 */
export function scaledIngredients(recipe: Recipe, cookingForServings: number): RecipeIngredient[] {
  const base = Math.max(1, recipe.servings || 1);
  const factor = Math.max(0, cookingForServings) / base;
  if (factor === 1) return recipe.ingredients;
  return recipe.ingredients.map((i) => ({
    ...i,
    amount: i.amount * factor,
    calories: i.calories * factor,
    proteinG: i.proteinG * factor,
    carbsG: i.carbsG * factor,
    fatG: i.fatG * factor,
    // A measure like "1 cup" stops being true the moment the amount changes,
    // and a wrong household measure is worse than none — the weight is still
    // exact, so drop the phrasing rather than mangle it.
    measure: undefined,
  }));
}

/** How an amount reads on screen: the weight always, the familiar measure too
 * when it still applies. */
export function ingredientAmountLabel(i: RecipeIngredient): string {
  const amount = i.amount >= 10 ? Math.round(i.amount) : Math.round(i.amount * 10) / 10;
  const weight = `${amount} ${i.unit}`;
  return i.measure ? `${weight} · ${i.measure}` : weight;
}

/**
 * The diary entry for eating `servings` of this recipe.
 *
 * The macros are copied in here and then stand alone: this is a snapshot of
 * what was eaten, not a live view of the recipe. Editing the recipe afterwards
 * — swapping an ingredient, regenerating it, changing the batch — must not
 * reach back and rewrite a day someone has already lived.
 */
export function foodItemForServings(recipe: Recipe, servings: number, portion: string): FoodItem {
  const m = roundMacros(scaleMacros(perServing(recipe), servings));
  return {
    name: recipe.name,
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    portion,
    recipeId: recipe.id,
    recipeServings: servings,
  };
}

/**
 * "1", "½", "1½" — the count only. Fractions of a serving are what people
 * actually take, and far easier to get right than cooked grams. The word
 * "serving" is added by the caller from the current language, so this stays
 * usable in both.
 */
export function servingCountLabel(servings: number): string {
  const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
  const whole = Math.floor(servings);
  const rest = Math.round((servings - whole) * 100) / 100;
  const frac = FRACTIONS[String(rest)];
  if (frac) return whole > 0 ? `${whole}${frac}` : frac;
  return String(Math.round(servings * 100) / 100);
}

/** Which plural form a serving count takes. A fraction of one serving is
 * still one serving's worth of thing — "½ serving", never "½ servings". */
export function servingPluralCount(servings: number): number {
  return servings <= 1 ? 1 : servings;
}

/** The portion sizes offered as chips. Fractions of a serving, not grams. */
export const SERVING_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

/**
 * Merge key for a shopping list. Two ingredients combine only when they are
 * the same thing, measured the same way, in the same state — otherwise 100 g
 * of raw rice and 300 g of cooked rice would add up to something that exists
 * nowhere.
 */
export function mergeKey(i: RecipeIngredient): string {
  return `${i.key}|${i.unit}|${i.state ?? 'raw'}`;
}
