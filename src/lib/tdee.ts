import type { ActivityLevel, DailyTargets, Goal, Profile } from './types';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Daily calorie adjustment per goal (kcal). ~0.5 kg/week pace. */
const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 350,
};

/** Mifflin-St Jeor basal metabolic rate. */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function tdee(p: Profile): number {
  return bmr(p) * ACTIVITY_MULTIPLIERS[p.activityLevel];
}

/**
 * Daily calorie + macro targets.
 * Protein: 1.6 g/kg (2.0 when cutting, to preserve muscle).
 * Fat: 30% of calories. Carbs: remainder.
 */
export function dailyTargets(p: Profile): DailyTargets {
  const calories = Math.max(1200, Math.round(tdee(p) + GOAL_ADJUSTMENTS[p.goal]));
  const proteinG = Math.round(p.weightKg * (p.goal === 'lose' ? 2.0 : 1.6));
  const fatG = Math.round((calories * 0.3) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  return { calories, proteinG, carbsG, fatG };
}
