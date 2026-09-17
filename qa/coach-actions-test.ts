// Server sanitizer for AI Support's proposed actions + the client apply path.
import { sanitizeCoachActions, ACTION_TOOLS } from '/home/user/CalApp/server/src/coach-actions.ts';
import { applyCoachAction } from '/home/user/CalApp/src/lib/coach-actions';
import { useAppStore } from '/home/user/CalApp/src/lib/store';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

// ── server: sanitize ──
check('seven tools, follow-ups included', ACTION_TOOLS.length === 7 && ACTION_TOOLS.some((t) => t.name === 'suggest_follow_ups'));

const out = sanitizeCoachActions([
  { name: 'propose_food_log', args: { mealType: 'lunch', date: '2026-09-17', items: [{ name: 'Tuna sandwich', calories: '420', proteinG: 30, carbsG: 45, fatG: 12, portion: '1 sandwich' }, { name: '' }], note: 'As you described it.' } },
  { name: 'propose_food_update', args: { mealId: 'm1', itemIndex: 0, calories: 760, note: 'A plate of kabsa is closer to 760 kcal.' } },
  { name: 'propose_food_update', args: { mealId: '', itemIndex: 0, calories: 1 } },
  { name: 'propose_workout_log', args: { exerciseName: 'Barbell Squat', sets: [{ weightKg: 80, reps: 8 }, { weightKg: 80, reps: 8 }, {}], date: 'today' } },
  { name: 'propose_targets', args: { calories: 2100, proteinG: 160, fatG: 0 } },
  { name: 'propose_water_log', args: { ml: 5000 } },
  { name: 'propose_water_log', args: { ml: 500 } },
  { name: 'propose_weight_log', args: { kg: 78.4, date: '2026-09-17' } },
  { name: 'suggest_follow_ups', args: { suggestions: ['Log it for me', 'Log it for me', 'Recalculate with 150 g', 'x', 'y'] } },
  { name: 'something_else', args: {} },
]);
check('food log kept with the blank item dropped, calories parsed from a string', out.actions[0]?.kind === 'logFood' && out.actions[0].items.length === 1 && out.actions[0].items[0].calories === 420 && out.actions[0].date === '2026-09-17' && out.actions[0].note === 'As you described it.', JSON.stringify(out.actions[0]));
check('food update with a patch; the one with an empty mealId dropped', out.actions[1]?.kind === 'updateFood' && out.actions[1].patch.calories === 760 && out.actions.filter((a) => a.kind === 'updateFood').length === 1);
check('workout sets: empty set dropped, bad date dropped', out.actions[2]?.kind === 'logWorkout' && out.actions[2].sets.length === 2 && out.actions[2].date === undefined);
check('targets keep only positive values', out.actions[3]?.kind === 'setTargets' && JSON.stringify(out.actions[3].targets) === '{"calories":2100,"proteinG":160}');
check('water: 5000 ml rejected, 500 kept', out.actions.filter((a) => a.kind === 'logWater').length === 1 && (out.actions[4] as { ml: number }).ml === 500);
check('weight kept', out.actions[5]?.kind === 'logWeight' && (out.actions[5] as { kg: number }).kg === 78.4);
check('follow-ups: deduped, capped at three', JSON.stringify(out.suggestions) === JSON.stringify(['Log it for me', 'Recalculate with 150 g', 'x']));

// ── client: apply through the store ──
const s0 = useAppStore.getState();
useAppStore.setState({
  meals: [{ id: 'm1', at: new Date().toISOString(), mealType: 'lunch', items: [{ name: 'Chicken kabsa', calories: 600, proteinG: 40, carbsG: 70, fatG: 15, portion: '1 plate', nutritionIncomplete: true, incompleteNutrients: ['fatG'] }] }],
  targets: { calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 },
  workouts: [],
  water: [],
  weights: [],
  exercises: [],
  profile: { ...(s0.profile ?? { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'lose' }) },
});

const r1 = applyCoachAction({ kind: 'logFood', mealType: 'breakfast', items: [{ name: 'Tuna sandwich', calories: 420, proteinG: 30, carbsG: 45, fatG: 12, portion: '1 sandwich' }] });
check('logFood writes a meal to the diary', r1.ok && useAppStore.getState().meals.length === 2 && useAppStore.getState().meals[0].items[0].name === 'Tuna sandwich');
if (r1.ok && r1.undo) r1.undo();
check('  and undo removes exactly that meal', useAppStore.getState().meals.length === 1 && useAppStore.getState().meals[0].id === 'm1');

const r2 = applyCoachAction({ kind: 'updateFood', mealId: 'm1', itemIndex: 0, patch: { calories: 760, fatG: 22 } });
const it = useAppStore.getState().meals[0].items[0];
check('updateFood patches the entry in place and the corrected fat becomes known', r2.ok && it.calories === 760 && it.fatG === 22 && it.incompleteNutrients === undefined && it.nutritionIncomplete === undefined, JSON.stringify(it));
if (r2.ok && r2.undo) r2.undo();
check('  undo restores the original item', useAppStore.getState().meals[0].items[0].calories === 600 && JSON.stringify(useAppStore.getState().meals[0].items[0].incompleteNutrients) === '["fatG"]');
const r3 = applyCoachAction({ kind: 'updateFood', mealId: 'nope', itemIndex: 0, patch: { calories: 1 } });
check('updateFood on a missing entry fails honestly', !r3.ok && r3.reason === 'missingEntry');

const r4 = applyCoachAction({ kind: 'logWorkout', exerciseName: 'Barbell Squat', sets: [{ weightKg: 80, reps: 8 }, { weightKg: 80, reps: 8 }] });
const w = useAppStore.getState().workouts[0];
check('logWorkout resolves the library exercise and logs both sets as done', r4.ok && !!w && w.exerciseId === 'builtin:squat' && w.sets.length === 2 && w.sets.every((x) => x.done), JSON.stringify(w?.exerciseId));
if (r4.ok && r4.undo) r4.undo();
check('  undo removes the workout it created', useAppStore.getState().workouts.length === 0);
const r5 = applyCoachAction({ kind: 'logWorkout', exerciseName: 'Zumba dance class', sets: [{ seconds: 3600 }] });
check('an unknown exercise becomes a custom library entry rather than a lost set', r5.ok && useAppStore.getState().exercises.some((e) => e.name === 'Zumba dance class') && useAppStore.getState().workouts.length === 1);

const r6 = applyCoachAction({ kind: 'setTargets', targets: { proteinG: 160 } });
check('setTargets merges into the existing targets', r6.ok && useAppStore.getState().targets?.proteinG === 160 && useAppStore.getState().targets?.calories === 2200);
if (r6.ok && r6.undo) r6.undo();
check('  undo restores them', useAppStore.getState().targets?.proteinG === 150);

const r7 = applyCoachAction({ kind: 'logWater', ml: 500 });
check('logWater adds an entry', r7.ok && useAppStore.getState().water.length === 1);
if (r7.ok && r7.undo) r7.undo();
check('  undo removes it', useAppStore.getState().water.length === 0);

const r8 = applyCoachAction({ kind: 'logWeight', kg: 78.4, date: '2026-09-15' });
check('logWeight files the reading on the stated day', r8.ok && useAppStore.getState().weights.length === 1 && useAppStore.getState().weights[0].at.startsWith('2026-09-15'));
if (r8.ok && r8.undo) r8.undo();
check('  undo deletes it', useAppStore.getState().weights.length === 0);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
