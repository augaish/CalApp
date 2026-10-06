import type { FoodItem, NutrientKey, Recipe, RecipeIngredient } from './types';
import { parsePortionAmount, portionLabelFor } from './portion';

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
export function ingredientAmountLabel(i: RecipeIngredient, t?: (key: string) => string): string {
  const amount = i.amount >= 10 ? Math.round(i.amount) : Math.round(i.amount * 10) / 10;
  // The unit in the language shown ("g" / "غ"), when a translator is given.
  const unit = t ? t(i.unit === 'ml' ? 'common.ml' : 'common.grams') : i.unit;
  const weight = `${amount} ${unit}`;
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
  const basis = perServing(recipe);
  const m = roundMacros(scaleMacros(basis, servings));
  return {
    name: recipe.name,
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    portion,
    recipeId: recipe.id,
    recipeServings: servings,
    // Unrounded, so a later correction rescales from this rather than from
    // the rounded figures above — five edits land where one would.
    recipeBasis: basis,
    ...(recipeUnknownNutrients(recipe).length > 0 ? { nutritionIncomplete: true as const, incompleteNutrients: recipeUnknownNutrients(recipe) } : {}),
  };
}

/**
 * What one serving of a logged entry was worth, for correcting its portion
 * later.
 *
 * Prefers the basis stored at log time. Falls back to dividing the rounded
 * macros by the servings for entries logged before that existed — lossy, but
 * correct to within a calorie and far better than refusing to edit. Returns
 * null when the entry records no servings at all, which the screen has to
 * say plainly rather than guess at.
 */
export function loggedBasis(item: FoodItem): Macros | null {
  if (item.recipeBasis) return item.recipeBasis;
  const servings = item.recipeServings;
  if (!servings || servings <= 0) return null;
  return scaleMacros(
    { calories: item.calories, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG },
    1 / servings,
  );
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
 * How a food item's portion reads, in the language shown now. A recipe
 * portion is rebuilt from its serving count ("½ serving" / "½ حصة") instead
 * of the text saved with it, which stays in whatever language was on when
 * it was logged; anything else shows the portion as written.
 */
export function portionText(
  item: { portion?: string; recipeServings?: number; portionMultiplier?: number; portionBase?: unknown },
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  const n = item.recipeServings;
  if (typeof n === 'number' && n > 0) return `${servingCountLabel(n)} ${t('recipe.servingUnit', { count: servingPluralCount(n) })}`;
  // Saved before labels followed the portion: the text still describes one
  // whole portion, so "½" of it is spelled out here.
  const m = item.portionMultiplier;
  if (!item.portionBase && item.portion && typeof m === 'number' && m > 0 && Math.abs(m - 1) > 1e-6) {
    const amount = parsePortionAmount(item.portion);
    return portionLabelFor({ label: item.portion, ...amount, macros: ZERO }, m);
  }
  return item.portion ?? '';
}

/** The offered step closest to a planned portion (1 when there is none). */
export function nearestServingStep(servings: number | null | undefined): (typeof SERVING_STEPS)[number] {
  if (servings == null || !(servings > 0)) return 1;
  return SERVING_STEPS.reduce((best, s) => (Math.abs(s - servings) < Math.abs(best - servings) ? s : best), SERVING_STEPS[0]);
}

/**
 * A recipe with one ingredient's quantity corrected.
 *
 * Its nutrition moves with the amount, because an estimate per 150 g of onion
 * is no longer true at 300 g. Identity, unit and raw/cooked state never move —
 * changing how much of a thing you use is not changing the thing, and a
 * shopping list must keep merging it with the same item elsewhere. A
 * substitution is a different feature entirely.
 *
 * A household measure written for the old amount is dropped rather than left
 * to lie: "1 cup" stops being true the moment the weight changes.
 */
export function withIngredientAmount(
  recipe: Recipe,
  index: number,
  amount: number,
): Recipe {
  const current = recipe.ingredients[index];
  if (!current || !(amount > 0)) return recipe;
  const factor = amount / current.amount;
  if (!Number.isFinite(factor)) return recipe;
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((i, n) =>
      n === index
        ? {
            ...i,
            amount,
            calories: i.calories * factor,
            proteinG: i.proteinG * factor,
            carbsG: i.carbsG * factor,
            fatG: i.fatG * factor,
            measure: undefined,
            // Hand-corrected, but the nutrition per gram is still the
            // model's estimate — the flag belongs to where the numbers came
            // from, and that has not changed.
          }
        : i,
    ),
  };
}

/**
 * Merge key for a shopping list. Two ingredients combine only when they are
 * the same thing, measured the same way, in the same state — otherwise 100 g
 * of raw rice and 300 g of cooked rice would add up to something that exists
 * nowhere.
 */
export function mergeKey(i: RecipeIngredient): string {
  return `${i.key}|${i.unit}|${i.state ?? 'raw'}`;
}

/** Planning and logging wait for a person to have looked at an AI draft. */
export function isReady(recipe: Pick<Recipe, 'reviewStatus'>): boolean {
  return recipe.reviewStatus !== 'needs_review';
}

/** How many ingredients carry no nutrition at all — shown beside any total
 * built from them, so a partial sum is never mistaken for a complete one. */
export function unknownNutritionCount(recipe: Pick<Recipe, 'ingredients'>): number {
  return recipe.ingredients.filter((i) => unknownNutrientsOf(i).length > 0).length;
}

export const NUTRIENT_KEYS: NutrientKey[] = ['calories', 'proteinG', 'carbsG', 'fatG'];

/** The nutrients an ingredient's author never entered. */
export function unknownNutrientsOf(i: Pick<RecipeIngredient, 'macrosUnknown' | 'unknownNutrients'>): NutrientKey[] {
  if (i.macrosUnknown) return NUTRIENT_KEYS;
  return i.unknownNutrients ?? [];
}

/** Every nutrient for which the recipe's total is a known subtotal, not a total. */
export function recipeUnknownNutrients(recipe: Pick<Recipe, 'ingredients'>): NutrientKey[] {
  const set = new Set<NutrientKey>();
  for (const i of recipe.ingredients) for (const k of unknownNutrientsOf(i)) set.add(k);
  return NUTRIENT_KEYS.filter((k) => set.has(k));
}

/**
 * The nutrients of a logged entry that are a known subtotal rather than a
 * total. Entries logged before the per-nutrient list existed carry only the
 * boolean and count as all four, so nothing unknown is ever shown as zero.
 */
export function itemUnknownNutrients(item: Pick<FoodItem, 'nutritionIncomplete' | 'incompleteNutrients'>): NutrientKey[] {
  if (item.incompleteNutrients) return item.incompleteNutrients;
  return item.nutritionIncomplete ? NUTRIENT_KEYS : [];
}

/** The completeness flags for a saved entry, or nothing at all when every value is known. */
export function incompleteFlags(unknown: NutrientKey[]): Pick<FoodItem, 'nutritionIncomplete' | 'incompleteNutrients'> {
  return unknown.length > 0 ? { nutritionIncomplete: true, incompleteNutrients: unknown } : {};
}

/**
 * One serving's calories and protein for a recipe card, honest about gaps:
 * a total that is only a known subtotal reads "≥n", and protein that is not
 * known at all is null so the card can say "protein unknown" rather than
 * "0 g" (a measured zero stays 0). The same rule as the recipe page.
 */
export function servingSummary(recipe: Recipe): { calories: string; protein: string | null } {
  const m = roundMacros(perServing(recipe));
  const unknown = recipeUnknownNutrients(recipe);
  const proteinUnknown = unknown.includes('proteinG');
  return {
    calories: knownLabel(m.calories, unknown.includes('calories')),
    protein: proteinUnknown && m.proteinG <= 0 ? null : knownLabel(m.proteinG, proteinUnknown),
  };
}

/**
 * A figure for display when part of it may be unknown: the number when the
 * total is complete, "≥number" for a known subtotal, and a dash when nothing
 * at all is known (section 7: missing is unknown, not zero).
 */
export function knownLabel(value: number | string, unknown: boolean, dash = '—'): string {
  if (!unknown) return String(value);
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  return n > 0 ? `≥${value}` : dash;
}

/**
 * Hands-off waiting the steps ask for, in minutes ("refrigerate for at least
 * 4 hours" is 240, "overnight" 480), English or Arabic; the longest wins.
 * For recipes saved before the AI reported a wait. Same rule as the server.
 */
export function waitInSteps(steps: string[]): number | undefined {
  let best = 0;
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  for (const raw of steps) {
    const text = raw.toLowerCase().replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
    // A step's own number of hours is the wait ("at least 4 hours, or
    // overnight" is 4); overnight counts only where no number is given.
    let step = 0;
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to|إلى|الى)\s*\d+(?:\.\d+)?\s*)?(?:hours?|hrs?|h\b|ساعات|ساعة)/g)) {
      step = Math.max(step, Math.round(Number(m[1]) * 60));
    }
    if (!step && /ساعتين|ساعتان/.test(text)) step = 120;
    if (!step && /overnight|طوال الليل|ليلة كاملة|حتى الصباح/.test(text)) step = 480;
    best = Math.max(best, step);
  }
  return best > 0 ? Math.min(best, 2880) : undefined;
}

/**
 * Hands-on time and, when the recipe has to wait (chill, marinate, rise),
 * how long until it is ready — so "13 min" never hides a 4-hour fridge step.
 */
export function recipeTimes(recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes' | 'waitMinutes' | 'steps'>): { active: number; readyHours: number | null } {
  const active = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const wait = recipe.waitMinutes ?? waitInSteps(recipe.steps ?? []) ?? 0;
  if (wait < 60) return { active: active + wait, readyHours: null };
  // Whole hours, never rounded below the wait itself.
  return { active, readyHours: Math.max(1, Math.round((active + wait) / 60)) };
}
