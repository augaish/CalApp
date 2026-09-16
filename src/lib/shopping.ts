import { mergeKey, scaledIngredients } from './recipes';
import type { MealType, Recipe, RecipeAisle, RecipeIngredient } from './types';

/**
 * Turning a stretch of planned meals into a shopping list.
 *
 * Only *decisions* are ever stored — the dates, what you already have, what
 * you have ticked off, which recipes you are cooking as one batch. The
 * quantities themselves are recomputed from the plan every time, which is what
 * lets the list survive a plan change instead of going stale behind it.
 */

/** One planned meal that a recipe stands in for. */
export interface PlannedRecipeMeal {
  dayKey: string;
  slot: MealType;
  recipe: Recipe;
  /** Servings of it planned for that meal. */
  servings: number;
  /** Set when several meals explicitly come out of one pot. */
  batchId?: string;
}

export interface ShoppingContribution {
  recipeId: string;
  recipeName: string;
  dayKey: string;
  slot: MealType;
  /** The amount this meal contributed, in the line's unit. */
  amount: number;
}

export interface ShoppingLine {
  /** mergeKey: identity + unit + state. Two lines never share one. */
  key: string;
  name: string;
  amount: number;
  unit: 'g' | 'ml';
  state: 'raw' | 'cooked';
  aisle: RecipeAisle;
  /** Which meals asked for it, so a quantity can be explained. */
  from: ShoppingContribution[];
}

/** What a recipe is being cooked in, across the chosen dates. */
export interface CookPlan {
  recipeId: string;
  recipeName: string;
  /** Meals in the window that this recipe covers. */
  meals: PlannedRecipeMeal[];
  /** Servings eaten across those meals. */
  servingsEaten: number;
  /** Servings actually cooked — what you shop for. */
  servingsCooked: number;
  /** True when those meals come out of one pot rather than separate cooks. */
  oneBatch: boolean;
}

/**
 * How much of each recipe is actually being cooked.
 *
 * Two meals naming the same recipe do NOT imply leftovers: cooking twice is
 * the ordinary case, and assuming otherwise would under-buy. Only an explicit
 * "one batch" says the pot is shared — and then the shopping is for the
 * recipe's own batch size, because that is what goes in the pan, not the
 * smaller amount that ends up eaten.
 */
export function cookPlans(meals: PlannedRecipeMeal[], oneBatch: Record<string, boolean>): CookPlan[] {
  const byRecipe = new Map<string, PlannedRecipeMeal[]>();
  for (const meal of meals) {
    const list = byRecipe.get(meal.recipe.id);
    if (list) list.push(meal);
    else byRecipe.set(meal.recipe.id, [meal]);
  }
  const out: CookPlan[] = [];
  for (const [recipeId, group] of byRecipe) {
    const servingsEaten = group.reduce((sum, m) => sum + m.servings, 0);
    const batched = oneBatch[recipeId] === true;
    const batchSize = Math.max(1, group[0].recipe.servings || 1);
    out.push({
      recipeId,
      recipeName: group[0].recipe.name,
      meals: group,
      servingsEaten,
      // One pot: buy for the whole batch, however little of it is eaten in
      // this window — the rest is the leftovers. Otherwise buy for exactly
      // what the meals need.
      servingsCooked: batched ? batchSize : servingsEaten,
      oneBatch: batched,
    });
  }
  return out;
}

const AISLE_ORDER: RecipeAisle[] = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'frozen',
  'pantry',
  'spices',
  'other',
];

/**
 * Merge every ingredient across the chosen meals into one line each.
 *
 * Two entries combine only when their identity, unit AND raw/cooked state all
 * match — 100 g of raw rice plus 300 g of cooked rice is not 400 g of
 * anything. Identity comes from the resolved ingredient key, so "rice" and
 * "أرز" are one line while basmati stays its own.
 */
export function buildShoppingLines(plans: CookPlan[]): ShoppingLine[] {
  const byKey = new Map<string, ShoppingLine>();
  for (const plan of plans) {
    const recipe = plan.meals[0].recipe;
    const ingredients: RecipeIngredient[] = scaledIngredients(recipe, plan.servingsCooked);
    // A shared batch is bought once; separate cooks already summed into
    // servingsCooked above, so either way this runs a single time per recipe.
    for (const ing of ingredients) {
      const key = mergeKey(ing);
      const existing = byKey.get(key);
      const contribution: ShoppingContribution = {
        recipeId: recipe.id,
        recipeName: recipe.name,
        dayKey: plan.meals[0].dayKey,
        slot: plan.meals[0].slot,
        amount: ing.amount,
      };
      if (existing) {
        existing.amount += ing.amount;
        existing.from.push(contribution);
      } else {
        byKey.set(key, {
          key,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          state: ing.state ?? 'raw',
          aisle: ing.aisle ?? 'other',
          from: [contribution],
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const byAisle = AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle);
    return byAisle !== 0 ? byAisle : a.name.localeCompare(b.name);
  });
}

/** Lines grouped into the sections you walk past in a shop. */
export function byAisle(lines: ShoppingLine[]): { aisle: RecipeAisle; lines: ShoppingLine[] }[] {
  const out: { aisle: RecipeAisle; lines: ShoppingLine[] }[] = [];
  for (const aisle of AISLE_ORDER) {
    const group = lines.filter((l) => l.aisle === aisle);
    if (group.length > 0) out.push({ aisle, lines: group });
  }
  return out;
}

/** How much to display for a line — whole grams, one decimal below ten. */
export function shoppingAmountLabel(line: Pick<ShoppingLine, 'amount' | 'unit'>): string {
  const n = line.amount >= 10 ? Math.round(line.amount) : Math.round(line.amount * 10) / 10;
  return `${n} ${line.unit}`;
}

export type LineStatus =
  | { kind: 'todo' }
  | { kind: 'have' }
  | { kind: 'done' }
  /** Ticked off, but the plan has since asked for more of it. */
  | { kind: 'shortfall'; extra: number };

/**
 * What a line's tick means now that the plan may have moved under it.
 *
 * A ticked item whose quantity has grown is the case worth catching: treating
 * the larger amount as already bought is how someone gets home with 500 g when
 * the week needs 800. The tick is kept — they did buy something — and the
 * difference is called out instead.
 */
export function lineStatus(
  line: ShoppingLine,
  have: Record<string, boolean>,
  checkedAt: Record<string, number>,
): LineStatus {
  if (have[line.key]) return { kind: 'have' };
  const boughtFor = checkedAt[line.key];
  if (boughtFor == null) return { kind: 'todo' };
  // A gram or two of float drift is not a shortfall worth mentioning.
  const extra = line.amount - boughtFor;
  if (extra > 0.5) return { kind: 'shortfall', extra };
  return { kind: 'done' };
}

/** Plain text for the phone's share sheet — the list as someone would write
 * it out, quantities included so it is useful to whoever receives it. */
export function shoppingListText(
  groups: { aisle: RecipeAisle; lines: ShoppingLine[] }[],
  labels: { title: string; aisle: (a: RecipeAisle) => string },
  skip: (line: ShoppingLine) => boolean,
): string {
  const parts = [labels.title, ''];
  for (const group of groups) {
    const lines = group.lines.filter((l) => !skip(l));
    if (lines.length === 0) continue;
    parts.push(`${labels.aisle(group.aisle)}:`);
    for (const line of lines) parts.push(`- ${line.name} — ${shoppingAmountLabel(line)}`);
    parts.push('');
  }
  return parts.join('\n').trim();
}
