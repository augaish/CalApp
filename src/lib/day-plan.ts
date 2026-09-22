import { resolvePlan, type Schedule, type TemplateDay } from './occurrences';
import { applyOrder, dateKey, isSameDay } from './store';
import type { LoggedWorkout, WorkoutOccurrence } from './types';

export interface DayPlanInput {
  schedule: Schedule;
  occurrences: Record<string, WorkoutOccurrence>;
  workouts: LoggedWorkout[];
  skips: Record<string, string[]>;
  dayOrder: Record<string, string[]>;
}

export interface DayPlan {
  /** The day's exercises in the order the person sees them on Training. */
  ids: string[];
  /** The template (or moved occurrence) day behind it, if any. */
  plan?: TemplateDay;
  weekday: number;
  /** Planned exercises skipped for this date only. */
  skippedPlanIds: string[];
  /** Logged on this day without being on the plan — scanned, picked, duplicated. */
  unplannedIds: string[];
  /** When the day is an occurrence moved here from another date, that date's key. */
  movedFrom?: string;
}

/**
 * One reading of "what am I training today": the weekday's plan (or the
 * occurrence moved onto this date) minus the exercises skipped for the day,
 * plus anything logged on the day the plan does not know about, in the
 * order saved for the date. The Training card and the live workout both
 * read this, so a reorder or a skip made on one is what the other shows —
 * the session no longer trains from a copy taken when it started.
 */
export function dayExerciseIds(s: DayPlanInput, day: Date): DayPlan {
  const resolved = resolvePlan(s.schedule, s.occurrences, day);
  const plan = resolved?.day;
  const weekday = resolved?.weekday ?? day.getDay();
  const key = dateKey(day);
  const skipped = s.skips[key] ?? [];
  const scheduledIds = plan ? plan.exerciseIds.filter((id) => !skipped.includes(id)) : [];
  const skippedPlanIds = plan ? plan.exerciseIds.filter((id) => skipped.includes(id)) : [];
  const logged = s.workouts.filter((w) => isSameDay(w.at, day));
  const unplannedIds = [...new Set(logged.map((w) => w.exerciseId))].filter((id) => !scheduledIds.includes(id));
  return {
    ids: applyOrder([...scheduledIds, ...unplannedIds], s.dayOrder[key]),
    plan,
    weekday,
    skippedPlanIds,
    unplannedIds,
    movedFrom: resolved?.movedFrom,
  };
}
