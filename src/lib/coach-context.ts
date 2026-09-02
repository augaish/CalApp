import { fetchWhoopSummary } from './api';
import { exerciseName, findExercise } from './exercises';
import { ageFrom } from './tdee';
import {
  actualBurnedForDay,
  fastingStreakDays,
  streakDays,
  totalsForDay,
  useAppStore,
  waterForDay,
  workoutStreakDays,
} from './store';
import type { BodyMeasurements, Language } from './types';

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
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 24h local time, deliberately not locale-formatted — this is data for the
 * model to read and quote back, not UI text, so a fixed HH:MM keeps it
 * unambiguous regardless of the user's language. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Build the snapshot for the last `dayCount` days (today first). */
export async function buildCoachContext(lang: Language, dayCount = 7): Promise<CoachContext> {
  const s = useAppStore.getState();
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
        return `${name} (${hhmm(w.at)})`;
      });
    days.push({
      date: ymd(d),
      calories: Math.round(totals.calories),
      proteinG: Math.round(totals.proteinG),
      carbsG: Math.round(totals.carbsG),
      fatG: Math.round(totals.fatG),
      burned: actualBurnedForDay(s.workouts, s.whoopBurnByDay, s.whoopWorkoutsByDay, d),
      waterMl: waterForDay(s.water, d),
      workouts: names.slice(0, 8),
    });
  }

  // A no-op single query when there's no connection — cheap enough to just
  // always ask rather than caching "are we connected" separately.
  const whoopSummary = await fetchWhoopSummary();
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
  const latest = s.weights[0];
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
    whoop,
    latestBodyReading,
    fasting,
    referenceDocs: s.coachReferenceDocs.length
      ? s.coachReferenceDocs.map((d) => ({ name: d.name, summary: d.summary }))
      : undefined,
  };
}
