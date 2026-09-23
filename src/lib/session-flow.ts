/**
 * How a workout moves from set to set and exercise to exercise.
 *
 * Kept free of React Native so the rules can be tested on their own.
 */

/** Sets an exercise is taken to have when the plan does not say. */
export const DEFAULT_SETS = 3;

/**
 * How many sets this exercise is aiming for today: the plan's count when the
 * plan lists sets for it, three otherwise.
 */
export function setGoal(plannedCount: number): number {
  return plannedCount > 0 ? plannedCount : DEFAULT_SETS;
}

export type CompleteLabel =
  | { key: 'session.completeSetOf'; n: number; total: number }
  | { key: 'session.completeLastSet'; n: number; total: number }
  | { key: 'session.completeExtraSet'; n: number; total: number };

/**
 * What the main button says before set `n` (1-based) is logged: "Complete
 * set 2 of 3", "Complete last set", then "Add extra set (4)" once the goal
 * is met, so the person always knows where they are without looking up.
 */
export function completeLabel(n: number, goal: number): CompleteLabel {
  if (n < goal) return { key: 'session.completeSetOf', n, total: goal };
  if (n === goal) return { key: 'session.completeLastSet', n, total: goal };
  return { key: 'session.completeExtraSet', n, total: goal };
}

export type AfterSet = { kind: 'stay' } | { kind: 'next'; index: number } | { kind: 'finish' };

/**
 * What happens once set `n` has just been logged on the exercise at `index`.
 *
 * Only the set that meets the goal moves the person on — an extra set after
 * it stays put, since they chose to do more. They go to the next exercise
 * still short of its goal, looking forward first and then wrapping round to
 * any skipped earlier; when every exercise has met its goal, the workout is
 * done and the summary opens.
 *
 * `doneByIndex` is each exercise's count of completed sets, including the
 * one just logged; `goalByIndex` is each exercise's goal.
 */
export function afterSet(
  n: number,
  index: number,
  doneByIndex: number[],
  goalByIndex: number[],
): AfterSet {
  if (n !== goalByIndex[index]) return { kind: 'stay' };
  const total = doneByIndex.length;
  for (let step = 1; step < total; step++) {
    const i = (index + step) % total;
    if (doneByIndex[i] < goalByIndex[i]) return { kind: 'next', index: i };
  }
  return { kind: 'finish' };
}
