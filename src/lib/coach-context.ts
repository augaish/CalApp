import { exerciseName, findExercise } from './exercises';
import {
  burnedForDay,
  streakDays,
  totalsForDay,
  useAppStore,
  waterForDay,
  workoutStreakDays,
} from './store';
import type { Language } from './types';

/**
 * Compact snapshot of the user's own data, sent with each coach message so it
 * can answer "how were my last 3 days?" instead of asking the user to retype
 * everything. Deliberately a small summary — not raw logs — to keep the token
 * cost (and therefore the per-message price) low.
 */
export interface CoachContext {
  profile?: {
    sex?: string;
    age?: number;
    heightCm?: number;
    weightKg?: number;
    goal?: string;
    activity?: string;
  };
  targets?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  days: {
    date: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    burned: number;
    waterMl: number;
    workouts: string[];
  }[];
  streakDays: number;
  workoutStreakDays: number;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build the snapshot for the last `dayCount` days (today first). */
export function buildCoachContext(lang: Language, dayCount = 7): CoachContext {
  const s = useAppStore.getState();
  const days: CoachContext['days'] = [];

  for (let i = 0; i < dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const totals = totalsForDay(s.meals, d);
    const names = s.workouts
      .filter((w) => {
        const wd = new Date(w.at);
        return (
          wd.getFullYear() === d.getFullYear() &&
          wd.getMonth() === d.getMonth() &&
          wd.getDate() === d.getDate()
        );
      })
      .map((w) => {
        const ex = findExercise(w.exerciseId, s.exercises);
        return ex ? exerciseName(ex, lang) : w.exerciseName;
      });
    days.push({
      date: ymd(d),
      calories: Math.round(totals.calories),
      proteinG: Math.round(totals.proteinG),
      carbsG: Math.round(totals.carbsG),
      fatG: Math.round(totals.fatG),
      burned: burnedForDay(s.workouts, d),
      waterMl: waterForDay(s.water, d),
      workouts: names.slice(0, 8),
    });
  }

  return {
    profile: s.profile
      ? {
          sex: s.profile.sex,
          age: s.profile.age,
          heightCm: s.profile.heightCm,
          weightKg: s.profile.weightKg,
          goal: s.profile.goal,
          activity: s.profile.activityLevel,
        }
      : undefined,
    targets: s.targets
      ? {
          calories: s.targets.calories,
          proteinG: s.targets.proteinG,
          carbsG: s.targets.carbsG,
          fatG: s.targets.fatG,
        }
      : undefined,
    days,
    streakDays: streakDays(s.meals),
    workoutStreakDays: workoutStreakDays(s.workouts),
  };
}
