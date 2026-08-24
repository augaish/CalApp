import { matchExerciseByName } from './exercises';
import type { CoachSchedulePlan, Exercise, PlannedSet } from './types';

export interface ResolvedScheduleDay {
  weekday: number;
  title?: string;
  exerciseIds: string[];
  plans: Record<string, PlannedSet[]>;
}

export interface ResolvedCoachSchedule {
  /** Custom exercises to create for names that matched nothing in the library. */
  newExercises: Exercise[];
  days: ResolvedScheduleDay[];
  /** Weekdays the plan would overwrite, because they already have exercises. */
  overlapWeekdays: number[];
}

/**
 * The seed rep count for a freshly created planned set, from whatever the coach
 * wrote — "10", "8-12", "AMRAP". A range becomes its midpoint; anything with no
 * number at all falls back to a plain 10, never zero.
 */
export function parseRepsSeed(reps: string): number {
  const range = reps.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Math.round((parseInt(range[1], 10) + parseInt(range[2], 10)) / 2);
  const single = reps.match(/\d+/);
  return single ? Math.min(50, Math.max(1, parseInt(single[0], 10))) : 10;
}

let counter = 0;
/** A fresh id for a coach-proposed exercise the library doesn't already have. */
function newExerciseId(): string {
  counter += 1;
  return `custom:coach-${Date.now().toString(36)}-${counter}`;
}

/**
 * Turn a coach's proposed plan into something `applyCoachSchedule` can write
 * directly: exercise names resolved to real ids (matched against the library
 * first, created as custom only when nothing fits), and each day's sets seeded
 * with reps but no weight — the coach has no way to know what the user lifts.
 *
 * Pure and side-effect-free on purpose, so the confirmation UI can preview
 * exactly what pressing "Add" will do — including which weekdays it would
 * overwrite — before anything touches the store.
 */
export function resolveCoachSchedule(
  plan: CoachSchedulePlan,
  custom: Exercise[],
  existingSchedule: Record<number, { exerciseIds?: string[] } | undefined>,
): ResolvedCoachSchedule {
  const newExercises: Exercise[] = [];
  // Resolved once per distinct name across the whole plan, so the same
  // exercise appearing on two different days becomes one library entry.
  const resolvedByName = new Map<string, Exercise>();

  const resolve = (name: string): Exercise => {
    const key = name.trim().toLowerCase();
    const cached = resolvedByName.get(key);
    if (cached) return cached;
    const pool = [...custom, ...newExercises];
    const matched = matchExerciseByName(name, pool);
    const exercise: Exercise =
      matched ?? {
        id: newExerciseId(),
        name,
        category: 'fullBody',
        type: 'weight_reps',
        source: 'custom',
      };
    if (!matched) newExercises.push(exercise);
    resolvedByName.set(key, exercise);
    return exercise;
  };

  const days: ResolvedScheduleDay[] = plan.days.map((day) => {
    const exerciseIds: string[] = [];
    const plans: Record<string, PlannedSet[]> = {};
    for (const item of day.exercises) {
      const exercise = resolve(item.name);
      if (!exerciseIds.includes(exercise.id)) exerciseIds.push(exercise.id);
      const reps = parseRepsSeed(item.reps);
      plans[exercise.id] = Array.from({ length: item.sets }, () => ({ reps }));
    }
    return { weekday: day.weekday, title: day.title, exerciseIds, plans };
  });

  const overlapWeekdays = days
    .map((d) => d.weekday)
    .filter((weekday) => (existingSchedule[weekday]?.exerciseIds?.length ?? 0) > 0);

  return { newExercises, days, overlapWeekdays };
}
