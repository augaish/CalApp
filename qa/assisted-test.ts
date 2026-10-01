// Assisted machines: the weight helps you, so less of it is the better set —
// for the trophy, "Best", records and PR counts. Plus Dead Hang in the library.
import { bestScoreBefore, bestSetEver, bestSetIndex, isAssistedExercise, setScore } from '/home/user/CalApp/src/lib/store';
import { findExercise, matchExerciseByName } from '/home/user/CalApp/src/lib/exercises';
import { prsOn } from '/home/user/CalApp/src/lib/notify/facts';
import type { LoggedWorkout, WorkoutSet } from '/home/user/CalApp/src/lib/types';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const set = (weightKg: number, reps: number): WorkoutSet => ({ weightKg, reps, done: true });
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d; };
const w = (id: string, name: string, n: number, sets: WorkoutSet[]): LoggedWorkout =>
  ({ id: `${id}-${n}`, at: day(n).toISOString(), exerciseId: id, exerciseName: name, type: 'weight_reps', caloriesBurned: 0, sets }) as LoggedWorkout;

check('built-in assisted machines are recognised by id alone', isAssistedExercise('builtin:assisted-pull-up-machine') && isAssistedExercise('builtin:assisted-dip-machine') && isAssistedExercise('assisted-dip-machine'));
check('own exercise named "Assisted…" or "مساعد" counts', isAssistedExercise('custom:x', 'Assisted chin-up') && isAssistedExercise('custom:y', 'عقلة مساعد'));
check('a normal lift does not', !isAssistedExercise('bench-press', 'Bench Press'));

const sets = [set(40, 8), set(30, 8), set(35, 10)];
check('assisted: 30 kg help is the best set', bestSetIndex(sets, 'weight_reps', true) === 1);
check('normal lift: 40 kg is the best set', bestSetIndex(sets, 'weight_reps', false) === 0);
check('assisted: same help, more reps wins', setScore(set(30, 10), 'weight_reps', true) > setScore(set(30, 8), 'weight_reps', true));
check('assisted scores stay above zero', setScore(set(120, 1), 'weight_reps', true) > 0);

const AP = 'builtin:assisted-pull-up-machine';
const history = [w(AP, 'جهاز العقلة', 7, [set(40, 8)]), w(AP, 'جهاز العقلة', 0, [set(35, 8)])];
check('bestSetEver: the least help ever', bestSetEver(history, AP)?.set.weightKg === 35);
check('record before today = 40 kg help', bestScoreBefore(history, AP, day(0)) === setScore(set(40, 8), 'weight_reps', true));
check('going down to 35 kg counts as a PR today', prsOn(history, day(0)) === 1);
const heavier = [w(AP, 'Assisted Pull-Up', 7, [set(40, 8)]), w(AP, 'Assisted Pull-Up', 0, [set(45, 8)])];
check('more help is not a PR', prsOn(heavier, day(0)) === 0);

const dh = findExercise('builtin:dead-hang', []);
check('Dead Hang is in the library, timed like the plank', dh?.type === 'time' && /Dead Hang/.test(dh?.name ?? ''), JSON.stringify({ type: dh?.type, name: dh?.name }));
check('"dead hang" and "تعلق حر" find it; Deadlift stays Deadlift',
  (matchExerciseByName as (q: string, c: unknown[]) => { id: string } | undefined)('dead hang', [])?.id === 'builtin:dead-hang' &&
  (matchExerciseByName as (q: string, c: unknown[]) => { id: string } | undefined)('تعلق حر', [])?.id === 'builtin:dead-hang' &&
  (matchExerciseByName as (q: string, c: unknown[]) => { id: string } | undefined)('Deadlift', [])?.id === 'builtin:deadlift');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
