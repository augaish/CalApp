// One reading of the day's exercises, shared by the Training card and the
// live workout: plan minus skips, plus what was logged off-plan, in the
// saved order — and a session that follows it by identity.
import { dayExerciseIds } from '/home/user/CalApp/src/lib/day-plan';
import { dateKey, mergeExerciseState, useAppStore } from '/home/user/CalApp/src/lib/store';
import type { LoggedWorkout } from '/home/user/CalApp/src/lib/types';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const today = new Date();
const key = dateKey(today);
const at = (h: number) => { const d = new Date(today); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const w = (id: string, ex: string, done = true): LoggedWorkout => ({ id, at: at(9), updatedAt: at(9), exerciseId: ex, exerciseName: ex, type: 'weight_reps', caloriesBurned: 10, sets: [{ weightKg: 40, reps: 10, done }] });

const schedule = { [today.getDay()]: { title: 'Push', exerciseIds: ['a', 'b', 'c'], plans: { a: [{ reps: 10 }] } } };
const base = { schedule, occurrences: {}, workouts: [] as LoggedWorkout[], skips: {}, dayOrder: {} };

let out = dayExerciseIds(base, today);
check('the plan in its own order', out.ids.join() === 'a,b,c', out.ids.join());
check('  carries the template day and weekday', out.plan?.title === 'Push' && out.weekday === today.getDay());

out = dayExerciseIds({ ...base, dayOrder: { [key]: ['c', 'a', 'b'] } }, today);
check('a saved order for the date wins', out.ids.join() === 'c,a,b', out.ids.join());

out = dayExerciseIds({ ...base, skips: { [key]: ['b'] }, dayOrder: { [key]: ['c', 'a', 'b'] } }, today);
check('a skipped exercise leaves the list and is reported', out.ids.join() === 'c,a' && out.skippedPlanIds.join() === 'b', out.ids.join());

out = dayExerciseIds({ ...base, workouts: [w('w1', 'z')] }, today);
check('an exercise logged off-plan joins at the end', out.ids.join() === 'a,b,c,z' && out.unplannedIds.join() === 'z', out.ids.join());

out = dayExerciseIds({ ...base, workouts: [w('w1', 'z')], dayOrder: { [key]: ['z', 'a', 'b', 'c'] } }, today);
check('  and can be ordered like the rest', out.ids.join() === 'z,a,b,c', out.ids.join());

out = dayExerciseIds({ ...base, dayOrder: { [key]: ['q', 'b'] } }, today);
check('an order mentioning an exercise no longer on the day is ignored for it', out.ids.join() === 'b,a,c', out.ids.join());

out = dayExerciseIds({ ...base, schedule: {} }, today);
check('no plan, nothing logged: empty', out.ids.length === 0 && !out.plan);

// ── the session keeps its exercise across a reorder ──
useAppStore.setState({ schedule, occurrences: {}, workouts: [], skips: {}, dayOrder: {}, activeSession: null });
useAppStore.getState().startSession(today, ['a', 'b', 'c']);
let s = useAppStore.getState().activeSession!;
check('Start records the current exercise by identity', s.currentId === 'a' && s.index === 0);
useAppStore.getState().updateSession({ index: 1, currentId: 'b' });
useAppStore.getState().setDayOrder(today, ['c', 'b', 'a']);
const live = dayExerciseIds({ ...base, dayOrder: useAppStore.getState().dayOrder }, today).ids;
s = useAppStore.getState().activeSession!;
check('after a reorder the live list moved, the person did not', live.join() === 'c,b,a' && live.indexOf(s.currentId!) === 1, `${live.join()} · on ${s.currentId}`);

// ── a merge follows the current exercise too ──
const patch = mergeExerciseState({ ...useAppStore.getState(), profile: { weightKg: 80 } } as never, 'b', 'builtin:bench-press');
check('folding the current exercise into another moves the session onto it', patch?.activeSession?.currentId === 'builtin:bench-press' && patch?.activeSession?.exerciseIds.join() === 'a,builtin:bench-press,c', JSON.stringify(patch?.activeSession));

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
