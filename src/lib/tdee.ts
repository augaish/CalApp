import type { ActivityLevel, DailyTargets, Goal, Profile, Sex } from './types';

/** Calculator.net's own 6-tier BMR->TDEE activity table — verified against
 * its published example (BMR 1717 -> 2060/2361/2515/2661/2962/3262 kcal for
 * these six multipliers in order) and cross-checked against a second source
 * reproducing the same six factors. Not the older, coarser 5-tier Harris-
 * Benedict scale some calculators still use — this one's "Moderate" (1.465)
 * and "Active" (1.55) sit between where a 5-tier scale would put them. */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.465,
  active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

/** Default pace (kg/week) when a profile doesn't have its own — keeps older
 * saved profiles (from before pace was selectable) producing the same
 * targets they always did. */
export const DEFAULT_PACE: Record<Goal, number> = { lose: 0.5, maintain: 0, gain: 0.25 };

/** The pace choices offered on the goal step, in the order they're shown. */
export const LOSE_PACES = [0.25, 0.5, 1] as const;
export const GAIN_PACES = [0.25] as const;

/** ~1 kg of body fat ≈ 7700 kcal — the standard estimate behind "a 500
 * kcal/day deficit loses ~0.5 kg/week" style guidance. */
const KCAL_PER_KG = 7700;

/** Age in whole years from a birth date, computed fresh every time instead
 * of stored — so it's never wrong no matter how long someone's had the app. */
export function ageFrom(birthDate: string): number {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

/** Mifflin-St Jeor basal metabolic rate. */
export function bmr(p: { sex: Sex; age: number; heightCm: number; weightKg: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function tdee(p: Profile): number {
  const age = ageFrom(p.birthDate);
  return bmr({ sex: p.sex, age, heightCm: p.heightCm, weightKg: p.weightKg }) * ACTIVITY_MULTIPLIERS[p.activityLevel];
}

/**
 * Daily calorie adjustment for a given pace — never more than a 25% swing
 * off maintenance, regardless of how aggressive the requested pace is, so a
 * 1 kg/week pace on a low-TDEE person can't compute an unsafe deficit. Same
 * clamp both directions, so a fast bulk gets the same sanity check.
 */
export function calorieAdjustment(maintenanceCalories: number, goal: Goal, paceKgPerWeek: number): number {
  if (goal === 'maintain' || paceKgPerWeek <= 0) return 0;
  const raw = (paceKgPerWeek * KCAL_PER_KG) / 7;
  const capped = Math.min(raw, maintenanceCalories * 0.25);
  return goal === 'lose' ? -capped : capped;
}

/**
 * Food energy from macros: the Atwater factors every nutrition label uses.
 * 4 kcal per gram of protein and carbs, 9 per gram of fat.
 */
export function atwater(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

/** The carb figure that makes protein + carbs + fat add up to a calorie target. */
export function carbsForCalories(calories: number, proteinG: number, fatG: number): number {
  return Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
}

/**
 * Daily calorie + macro targets.
 * Protein: 1.6 g/kg (2.0 when cutting, to preserve muscle).
 * Fat: 30% of calories. Carbs: whatever is left, so the three macros add back
 * up to the calorie target.
 */
export function dailyTargets(p: Profile): DailyTargets {
  const maintenance = tdee(p);
  const pace = p.paceKgPerWeek ?? DEFAULT_PACE[p.goal];
  const calories = Math.max(1200, Math.round(maintenance + calorieAdjustment(maintenance, p.goal, pace)));
  const proteinG = Math.round(p.weightKg * (p.goal === 'lose' ? 2.0 : 1.6));
  const fatG = Math.round((calories * 0.3) / 9);
  const carbsG = carbsForCalories(calories, proteinG, fatG);
  return { calories, proteinG, carbsG, fatG };
}

export interface GoalScenario {
  goal: Goal;
  paceKgPerWeek: number;
  calories: number;
  /** True when the requested pace's deficit/surplus hit the 25%-of-maintenance
   * safety clamp, so the UI can say so instead of implying the exact pace
   * asked for is what will actually happen. */
  capped: boolean;
}

/**
 * Every pace-based scenario to show as a card on the goal step, each with
 * its own real calorie number computed from THIS profile's own maintenance
 * calories — not a single generic guess. `weightKg`/`activityLevel`/
 * `birthDate` etc. are taken from `base`; `goal`/`paceKgPerWeek` are
 * overridden per scenario.
 */
export function goalScenarios(base: Profile): GoalScenario[] {
  const maintenance = tdee(base);
  const scenario = (goal: Goal, paceKgPerWeek: number): GoalScenario => {
    const adjustment = calorieAdjustment(maintenance, goal, paceKgPerWeek);
    const raw = goal === 'maintain' ? 0 : (paceKgPerWeek * KCAL_PER_KG) / 7;
    return {
      goal,
      paceKgPerWeek,
      calories: Math.max(1200, Math.round(maintenance + adjustment)),
      capped: Math.abs(adjustment) < raw - 1,
    };
  };
  return [
    ...LOSE_PACES.map((pace) => scenario('lose', pace)),
    scenario('maintain', 0),
    ...GAIN_PACES.map((pace) => scenario('gain', pace)),
  ];
}

/** Whether a newly logged weight is different enough from what the profile's
 * current calorie/macro targets were actually computed from that it's worth
 * asking to recalculate them — half a kilo either way, not every gram of
 * day-to-day fluctuation. */
export function targetsNeedUpdate(profile: Profile, newWeightKg: number): boolean {
  return Math.abs(newWeightKg - profile.weightKg) >= 0.5;
}
