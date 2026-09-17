import { timestampFor } from './day';
import { matchExerciseByName, findExercise } from './exercises';
import { incompleteFlags, itemUnknownNutrients } from './recipes';
import { useAppStore } from './store';
import type { CoachAction } from './types';

/**
 * Apply one change AI Support proposed. Every path goes through the same
 * store actions the screens use, so a coach-logged meal is indistinguishable
 * from a hand-logged one — and every path that can be undone returns an
 * `undo`, because a tap on a card should be as reversible as the app's other
 * one-tap writes.
 */
export type ApplyResult = { ok: true; undo?: () => void } | { ok: false; reason: 'missingEntry' | 'noTargets' };

/** "YYYY-MM-DD" → an ISO timestamp on that day at the current time; today → now. */
function atFor(date?: string): string {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date().toISOString();
  return timestampFor(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function applyCoachAction(action: CoachAction): ApplyResult {
  const s = useAppStore.getState();
  switch (action.kind) {
    case 'logFood': {
      s.logMeal(
        action.items.map((i) => ({ ...i })),
        undefined,
        action.mealType,
        atFor(action.date),
      );
      const id = useAppStore.getState().meals[0]?.id;
      return { ok: true, undo: id ? () => useAppStore.getState().removeMeal(id) : undefined };
    }
    case 'updateFood': {
      const meal = s.meals.find((m) => m.id === action.mealId);
      const item = meal?.items[action.itemIndex];
      if (!meal || !item) return { ok: false, reason: 'missingEntry' };
      const previous = meal.items;
      const patch = action.patch;
      const next = previous.map((it, i) => {
        if (i !== action.itemIndex) return it;
        const out = { ...it, ...patch };
        // A macro set by hand breaks any scaling link, and becomes known.
        if ('calories' in patch || 'proteinG' in patch || 'carbsG' in patch || 'fatG' in patch) {
          delete out.basePer100;
          delete out.portionMultiplier;
          const stillUnknown = itemUnknownNutrients(it).filter((k) => !(k in patch));
          delete out.nutritionIncomplete;
          delete out.incompleteNutrients;
          Object.assign(out, incompleteFlags(stillUnknown));
        }
        return out;
      });
      s.updateMeal(meal.id, { items: next });
      return { ok: true, undo: () => useAppStore.getState().updateMeal(meal.id, { items: previous }) };
    }
    case 'logWorkout': {
      // The same resolution a proposed schedule uses: the library first, and
      // a custom entry when the name is new — never a lost set.
      let exercise = matchExerciseByName(action.exerciseName, s.exercises);
      if (!exercise) {
        const id = s.addExercise({ name: action.exerciseName, category: 'fullBody', type: 'weight_reps', source: 'custom' });
        exercise = findExercise(id, useAppStore.getState().exercises);
      }
      if (!exercise) return { ok: false, reason: 'missingEntry' };
      const at = atFor(action.date);
      const day = new Date(at);
      const existedBefore = useAppStore
        .getState()
        .workouts.some((w) => w.exerciseId === exercise!.id && new Date(w.at).toDateString() === day.toDateString());
      for (const set of action.sets) {
        useAppStore.getState().logSet(
          { id: exercise.id, name: exercise.name, type: exercise.type, category: exercise.category },
          { weightKg: set.weightKg, reps: set.reps, seconds: set.seconds, done: true },
          at,
        );
      }
      const logged = useAppStore
        .getState()
        .workouts.find((w) => w.exerciseId === exercise!.id && new Date(w.at).toDateString() === day.toDateString());
      // Undo only when the tap created the record; sets added to an existing
      // session are left for the session's own editor.
      return { ok: true, undo: !existedBefore && logged ? () => useAppStore.getState().removeWorkout(logged.id) : undefined };
    }
    case 'setTargets': {
      const previous = s.targets;
      if (!previous) return { ok: false, reason: 'noTargets' };
      s.setTargets({ ...previous, ...action.targets });
      return { ok: true, undo: () => useAppStore.getState().setTargets(previous) };
    }
    case 'logWater': {
      const at = new Date().toISOString();
      s.logWater(action.ml, at);
      return { ok: true, undo: () => useAppStore.setState((st) => ({ water: st.water.filter((e) => e.at !== at) })) };
    }
    case 'logWeight': {
      const at = atFor(action.date);
      s.logWeight(action.kg, at);
      return { ok: true, undo: () => useAppStore.getState().deleteWeight(at) };
    }
  }
}
