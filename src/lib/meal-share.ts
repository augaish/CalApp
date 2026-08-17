import { Share } from 'react-native';

import { createShareLink } from './api';
import { lightHaptic } from './feedback';
import { mealShareText, type SharedMeal } from './share';
import type { LoggedMeal, MealType } from './types';

/** Just enough of i18next's `t` for the labels below. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Share logged food to a chat. The macros go into the message as plain text so
 * anyone can read them, and a short link is appended for a recipient who has
 * the app and wants to log the same food.
 *
 * A failed link is not a failed share: the numbers are the point, so the
 * message still goes out without it.
 */
export async function shareMeals(
  meals: LoggedMeal[],
  heading: string,
  t: Translate,
): Promise<'sent' | 'empty'> {
  const withFood = meals.filter((m) => m.items.length > 0);
  if (withFood.length === 0) return 'empty';

  const payload: SharedMeal = {
    v: 1,
    kind: 'meal',
    // photoUri is a path on this phone, so it is dropped — see SharedMeal.
    meals: withFood.map((m) => ({ mealType: m.mealType, items: m.items })),
  };

  lightHaptic();
  const url = await createShareLink(payload, 'meal');
  const message = mealShareText(
    payload,
    {
      heading,
      mealTypeName: (type: MealType) => t(`home.mealTypes.${type}`),
      kcal: t('common.kcal'),
      protein: t('home.protein'),
      carbs: t('home.carbs'),
      fat: t('home.fat'),
      total: t('mealShare.total'),
      openHint: t('mealShare.openHint'),
    },
    url,
  );
  try {
    await Share.share({ message });
  } catch {
    // user cancelled the share sheet — no-op
  }
  return 'sent';
}
