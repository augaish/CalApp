import { normalizeDigits } from './numbers';
import { incompleteFlags, NUTRIENT_KEYS } from './recipes';
import type { MealAnalysis, NutrientKey } from './types';

/**
 * Nutrition figures a person wrote into a meal description themselves —
 * "709 kcal, 23 g protein" or "٧٠٩ سعرة حرارية، ٢٣ غ بروتين". When the AI
 * estimate does not come back, these are worth more than a retry: they are
 * the numbers the person was trying to log in the first place.
 */
export interface TypedNutrition {
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

const NUM = '(\\d+(?:\\.\\d+)?)';
const GRAMS = '(?:g|gm|gr|grams?|غ|جم|جرام|غرام)?';

/** "23 g protein" and "protein: 23 g", in either language. */
function unit(words: string, gramUnit = true): { after: RegExp; before: RegExp } {
  const g = gramUnit ? GRAMS : '';
  return {
    after: new RegExp(`${NUM}\\s*${g}\\s*(?:of\\s+)?(?:${words})`, 'i'),
    before: new RegExp(`(?:${words})\\s*[:=]?\\s*${NUM}`, 'i'),
  };
}

const PATTERNS: Record<NutrientKey, { after: RegExp; before: RegExp }> = {
  calories: {
    after: new RegExp(`${NUM}\\s*(?:kcal|cal(?:orie)?s?|سعرة|سعره|سعرات|سعر|كالوري)`, 'i'),
    before: new RegExp(`(?:kcal|calories?|(?:ال)?سعرات(?:\\s*(?:ال)?حرارية)?)\\s*[:=]?\\s*${NUM}`, 'i'),
  },
  proteinG: unit('proteins?|(?:ال)?بروتين'),
  carbsG: unit('carbs?|carbohydrates?|(?:ال)?كربوهيدرات|(?:ال)?كارب(?:وهيدرات)?'),
  fatG: unit('fats?|(?:ال)?دهون|(?:ال)?دهن'),
};

function find(text: string, key: NutrientKey): number | undefined {
  const m = text.match(PATTERNS[key].after) ?? text.match(PATTERNS[key].before);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** The figures stated in a description, or null when no calorie figure was given. */
export function extractTypedNutrition(text: string): TypedNutrition | null {
  const t = normalizeDigits(text);
  const calories = find(t, 'calories');
  if (calories == null) return null;
  return {
    calories,
    proteinG: find(t, 'proteinG'),
    carbsG: find(t, 'carbsG'),
    fatG: find(t, 'fatG'),
  };
}

/**
 * A meal made only of what the person typed. Nutrients they did not state
 * stay unknown — flagged, never zero — and the note says nothing was
 * estimated, so the result screen does not read like an AI answer.
 */
export function typedMealAnalysis(text: string, typed: TypedNutrition, note: string): MealAnalysis {
  const unknown = NUTRIENT_KEYS.filter((k) => k !== 'calories' && typed[k] == null);
  const name = text.split(/[\n,،.。;؛]/)[0].trim().slice(0, 60) || text.trim().slice(0, 60);
  return {
    items: [
      {
        name,
        calories: Math.round(typed.calories),
        proteinG: Math.round(typed.proteinG ?? 0),
        carbsG: Math.round(typed.carbsG ?? 0),
        fatG: Math.round(typed.fatG ?? 0),
        portion: '1',
        ...incompleteFlags(unknown),
      },
    ],
    confidence: 1,
    notes: note,
  };
}
