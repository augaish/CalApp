/**
 * Turning a model's answer into data we can trust.
 *
 * The meal routes used to do `JSON.parse(text)` and return a 502 on any
 * surprise. Two surprises were common enough to break real use:
 *
 *  - **Arabic-Indic digits.** Asked to answer in Arabic about "٧٠٠ جرام", the
 *    model would answer in kind and emit `"calories": ٦٢٠`, which is not valid
 *    JSON at all — so a perfectly good analysis came back as "Something went
 *    wrong".
 *  - **A sentence around the JSON.** "Here is the analysis: {...}" parses only
 *    after the prose is stripped.
 *
 * Everything here is deliberately forgiving on the way in and strict on the way
 * out: the app gets a well-formed MealAnalysis or a thrown error, never a
 * half-filled object.
 */

/** Arabic-Indic (٠-٩) and Extended/Persian (۰-۹) digits → ASCII. */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * Pull the JSON value out of a reply that may be fenced, prefixed with prose,
 * or written with non-ASCII digits. Throws when there is nothing parseable.
 */
export function extractJson(raw: string): unknown {
  const cleaned = asciiDigits(
    raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  );
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to the outermost braces, which survives a wrapping sentence.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error(`no JSON object in model reply: ${cleaned.slice(0, 200)}`);
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/**
 * A number out of whatever the model wrote: a real number, a quoted one, a
 * range ("600-700" → the midpoint, since either end is a defensible estimate),
 * or one dressed up with units or a tilde.
 */
export function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;
  const text = asciiDigits(value).replace(/,/g, '');
  const range = text.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  const single = text.match(/-?\d+(?:\.\d+)?/);
  return single ? parseFloat(single[0]) : fallback;
}

/** A blank string counts as missing, so a default can stand in for it. */
function str(value: unknown, fallback = ''): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

export interface FoodItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portion: string;
}

export interface MealAnalysis {
  items: FoodItem[];
  confidence: number;
  notes: string;
}

/** Food energy from macros: the Atwater factors every nutrition label uses. */
export function atwater(item: Pick<FoodItem, 'proteinG' | 'carbsG' | 'fatG'>): number {
  return item.proteinG * 4 + item.carbsG * 4 + item.fatG * 9;
}

/**
 * Make one item's calories agree with its own macros.
 *
 * The model estimates calories and macros separately, and its two answers rarely
 * match to the kcal — so the ring said "2119 eaten" while the macro row added up
 * to 2098, and a user checking the arithmetic found the app wrong. It was: those
 * were two independent estimates of the same meal.
 *
 * Calories become the exact Atwater sum, which makes the two rows agree by
 * construction at every level (the totals are plain sums, so if each item
 * balances, so does the day). Where the model's own calorie figure is HIGHER
 * than its macros imply, the macros are scaled up to meet it first: the calorie
 * estimate is the number the prompt is tuned for, and for a calorie tracker
 * quietly rounding a meal down is the worse failure.
 */
/**
 * Grow the macros by `scale`, handing out the leftover grams so the total energy
 * lands as close to `target` as whole grams allow.
 *
 * Rounding each macro on its own looks equivalent and is not: at a large scale
 * factor three downward roundings compound, and 5/5/5 g stretched to 620 kcal
 * came out at 612 — the very kind of quiet shortfall this reconciliation exists
 * to prevent.
 */
function scaleMacros(item: FoodItem, scale: number, target: number): FoodItem {
  const exact = [item.proteinG * scale, item.carbsG * scale, item.fatG * scale];
  const grams = exact.map(Math.floor);
  const kcalPerG = [4, 4, 9];
  const energy = () => grams[0] * 4 + grams[1] * 4 + grams[2] * 9;
  // Largest fractional part first, and only while it closes the gap.
  const order = [0, 1, 2].sort((a, b) => exact[b] - grams[b] - (exact[a] - grams[a]));
  for (const i of order) {
    if (Math.abs(energy() + kcalPerG[i] - target) < Math.abs(energy() - target)) grams[i] += 1;
  }
  return { ...item, proteinG: grams[0], carbsG: grams[1], fatG: grams[2] };
}

function balance(item: FoodItem): FoodItem {
  const implied = atwater(item);
  // No macro breakdown to reconcile against — keep the stated calories.
  if (implied === 0) return item;
  // Within whole-gram rounding noise: leave the estimate's macros untouched and
  // simply state the energy they actually represent.
  if (item.calories > implied * 1.02) {
    item = scaleMacros(item, item.calories / implied, item.calories);
  }
  // Recomputed from the final whole grams, so it is exact rather than close.
  return { ...item, calories: atwater(item) };
}

/**
 * Coerce a model reply into the shape the app renders. Items without a name are
 * dropped rather than shown as a blank row; macros are rounded because the app
 * never displays decimals.
 */
export function toMealAnalysis(raw: string): MealAnalysis {
  const parsed = extractJson(raw) as Record<string, unknown>;
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items: FoodItem[] = [];
  for (const entry of rawItems) {
    const item = entry as Record<string, unknown>;
    const name = str(item?.name);
    if (!name) continue;
    items.push(
      balance({
        name,
        calories: Math.max(0, Math.round(num(item.calories))),
        proteinG: Math.max(0, Math.round(num(item.proteinG))),
        carbsG: Math.max(0, Math.round(num(item.carbsG))),
        fatG: Math.max(0, Math.round(num(item.fatG))),
        portion: str(item.portion, '1'),
      }),
    );
  }
  // An empty items array is a legitimate answer ("this photo has no food"), so
  // it is passed through — the app already has a message for it.
  const confidence = Math.min(1, Math.max(0, num(parsed?.confidence, items.length ? 0.5 : 0)));
  return { items, confidence, notes: str(parsed?.notes) };
}
