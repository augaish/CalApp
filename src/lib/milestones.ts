import { useCelebrate } from './celebrate';
import { successHaptic } from './feedback';
import i18n from './i18n';
import { totalsForDay, useAppStore, waterForDay, waterTargetMl } from './store';

/**
 * The day's goals, marked when they are reached.
 *
 * Logging a set or a meal already had its moment; reaching the day's
 * protein or water goal — the thing all that logging is for — passed in
 * silence. This follows the store from any screen and says so once, at the
 * moment a log carries today's total across the line.
 */

/** True only when this change carried the total from below the target to at or above it. */
export function crossed(before: number, after: number, target: number): boolean {
  return target > 0 && before < target && after >= target;
}

let started = false;

export function startMilestones(): void {
  if (started) return;
  started = true;
  const snapshot = () => {
    const s = useAppStore.getState();
    const today = new Date();
    return {
      // Stored data from older versions can hold other shapes; a watcher
      // that runs at launch must never be the thing that crashes it.
      protein: Array.isArray(s.meals) ? totalsForDay(s.meals, today).proteinG : 0,
      proteinTarget: s.targets?.proteinG ?? 0,
      water: Array.isArray(s.water) ? waterForDay(s.water, today) : 0,
      waterTarget: s.profile ? waterTargetMl(s.profile.weightKg) : 0,
    };
  };
  let prev: ReturnType<typeof snapshot>;
  try {
    prev = snapshot();
  } catch {
    prev = { protein: 0, proteinTarget: 0, water: 0, waterTarget: 0 };
  }
  useAppStore.subscribe((s, old) => {
    if (s.meals === old.meals && s.water === old.water) return;
    let next: typeof prev;
    try {
      next = snapshot();
    } catch {
      return;
    }
    const key =
      s.meals !== old.meals && crossed(prev.protein, next.protein, next.proteinTarget)
        ? 'celebrate.proteinGoal'
        : s.water !== old.water && crossed(prev.water, next.water, next.waterTarget)
          ? 'celebrate.waterGoal'
          : null;
    prev = next;
    if (!key) return;
    // After the log's own "Meal logged" toast has had its moment, rather
    // than replacing it before it is read.
    setTimeout(() => {
      successHaptic();
      useCelebrate.getState().celebrate(i18n.t(key));
    }, 1800);
  });
}
