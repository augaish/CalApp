import { fetchWhoopSummary } from './api';
import { exerciseName, findExercise } from './exercises';
import { ageFrom } from './tdee';
import {
  actualBurnedForDay,
  fastingStreakDays,
  isSameDay,
  streakDays,
  totalsForDay,
  useAppStore,
  waterForDay,
  workoutStreakDays,
} from './store';
import type { BodyMeasurements, CoachFocus, CoachShare, Language } from './types';

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
  /** Only present when WHOOP is connected and has scored data — see server/src/prompts.ts for how the coach is told to read these. */
  whoop?: {
    recoveryScore?: number | null;
    hrvMs?: number | null;
    restingHr?: number | null;
    sleepPerformancePercent?: number | null;
    sleepHours?: number | null;
    todayStrain?: number | null;
  };
  /** The most recent logged body reading, when it has more than just a bare
   * weigh-in — feeds the AI program prompt's targets/schedule reasoning. */
  latestBodyReading?: {
    daysAgo: number;
    weightKg: number;
    bodyFatPercent?: number;
    skeletalMuscleMassKg?: number;
    /** Tape-measure circumferences (cm), when the reading has any. */
    measurementsCm?: BodyMeasurements;
  };
  /** Only present once the user has ever used the fasting timer. */
  fasting?: {
    /** The fast running right now, if any. */
    active?: { protocol: string; startedAt: string; targetHours: number };
    streakDays: number;
  };
  /** Summaries of documents the user has taught the coach (training
   * programs, meal plans, body-composition reports) — see CoachReferenceDoc. */
  referenceDocs?: { name: string; summary: string }[];
  /** S18: the area the person asked from — a hint, not a data source. */
  focus?: CoachFocus;
  /** Today's and yesterday's diary entries with the ids a proposed edit
   * (propose_food_update) has to quote back — the coach can only correct an
   * entry it can name. */
  recentMeals?: {
    id: string;
    date: string;
    mealType: string;
    items: { index: number; name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion?: string }[];
  }[];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 24h local time with seconds, deliberately not locale-formatted — this is
 * data for the model to read and quote back, not UI text, so a fixed
 * HH:MM:SS keeps it unambiguous regardless of the user's language. Seconds
 * matter here: checking off several planned exercises in quick succession
 * (the common case for a pre-planned day) logs each one a few seconds
 * apart, all within the same minute — HH:MM alone made every one of them
 * look identical to the coach, with no way to answer "which was logged
 * last" beyond guessing from list order.
 */
function hhmmss(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** Build the snapshot for the last `dayCount` days (today first). */
export async function buildCoachContext(lang: Language, dayCount = 7, focus?: CoachFocus): Promise<CoachContext> {
  const s = useAppStore.getState();
  // What may be shared is decided in Manage shared context (S18), never here.
  const share: CoachShare = s.coachShare ?? { food: true, training: true, body: true, wearable: true };
  const days: CoachContext['days'] = [];

  for (let i = 0; i < dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const totals = totalsForDay(s.meals, d);
    // Each entry carries when it was logged (e.g. "Bench Press (18:14)") —
    // the coach used to get bare exercise names with no way to answer "when
    // did I start training today", even though the timestamp exists on
    // every logged workout; it just wasn't in what gets sent.
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
        const name = ex ? exerciseName(ex, lang) : w.exerciseName;
        return `${name} (${hhmmss(w.at)})`;
      });
    days.push({
      date: ymd(d),
      calories: share.food ? Math.round(totals.calories) : 0,
      proteinG: share.food ? Math.round(totals.proteinG) : 0,
      carbsG: share.food ? Math.round(totals.carbsG) : 0,
      fatG: share.food ? Math.round(totals.fatG) : 0,
      burned: share.training ? actualBurnedForDay(s.workouts, s.whoopBurnByDay, s.whoopWorkoutsByDay, d) : 0,
      waterMl: share.food ? waterForDay(s.water, d) : 0,
      workouts: share.training ? names.slice(0, 8) : [],
    });
  }

  // A no-op single query when there's no connection — cheap enough to just
  // always ask rather than caching "are we connected" separately.
  const whoopSummary = share.wearable ? await fetchWhoopSummary() : null;
  const whoop =
    whoopSummary?.connected &&
    (whoopSummary.recoveryScore != null ||
      whoopSummary.sleepPerformancePercent != null ||
      whoopSummary.todayStrain != null)
      ? {
          recoveryScore: whoopSummary.recoveryScore,
          hrvMs: whoopSummary.hrvMs,
          restingHr: whoopSummary.restingHr,
          sleepPerformancePercent: whoopSummary.sleepPerformancePercent,
          sleepHours: whoopSummary.sleepHours,
          todayStrain: whoopSummary.todayStrain,
        }
      : undefined;

  // Only worth sending when it carries more than the bare weigh-in the
  // Overview screen logs — a plain kg entry adds nothing a program needs.
  const latest = share.body ? s.weights[0] : undefined;
  const latestBodyReading =
    latest && (latest.bodyFatPercent != null || latest.skeletalMuscleMassKg != null || latest.measurementsCm)
      ? {
          daysAgo: Math.max(0, Math.round((Date.now() - new Date(latest.at).getTime()) / 86400000)),
          weightKg: latest.kg,
          bodyFatPercent: latest.bodyFatPercent,
          skeletalMuscleMassKg: latest.skeletalMuscleMassKg,
          measurementsCm: latest.measurementsCm,
        }
      : undefined;

  // The entries themselves (not just the day's totals) for the last two
  // days, so "that lunch looks low" can become a one-tap correction.
  const twoDays = [0, 1].map((i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d;
  });
  const recentMeals: CoachContext['recentMeals'] = share.food
    ? s.meals
        .filter((m) => twoDays.some((d) => isSameDay(m.at, d)))
        .slice(0, 10)
        .map((m) => ({
          id: m.id,
          date: ymd(new Date(m.at)),
          mealType: m.mealType ?? 'snack',
          items: m.items.slice(0, 6).map((it, index) => ({
            index,
            name: it.name,
            calories: Math.round(it.calories),
            proteinG: Math.round(it.proteinG),
            carbsG: Math.round(it.carbsG),
            fatG: Math.round(it.fatG),
            ...(it.portion ? { portion: it.portion } : {}),
          })),
        }))
    : undefined;

  const fasting: CoachContext['fasting'] =
    s.activeFast || s.fastingHistory.length > 0
      ? {
          active: s.activeFast
            ? { protocol: s.activeFast.protocol, startedAt: s.activeFast.startedAt, targetHours: s.activeFast.targetHours }
            : undefined,
          streakDays: fastingStreakDays(s.fastingHistory),
        }
      : undefined;

  return {
    profile: s.profile
      ? {
          sex: s.profile.sex,
          age: ageFrom(s.profile.birthDate),
          heightCm: share.body ? s.profile.heightCm : undefined,
          weightKg: share.body ? s.profile.weightKg : undefined,
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
    streakDays: share.food ? streakDays(s.meals) : 0,
    workoutStreakDays: share.training ? workoutStreakDays(s.workouts) : 0,
    whoop,
    latestBodyReading,
    fasting,
    referenceDocs: s.coachReferenceDocs.length
      ? s.coachReferenceDocs.map((d) => ({ name: d.name, summary: d.summary }))
      : undefined,
    focus,
    recentMeals: recentMeals && recentMeals.length > 0 ? recentMeals : undefined,
  };
}
