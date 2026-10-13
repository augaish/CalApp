// "Do another day's workout": which days can be brought to today, the
// choices offered, what each choice writes, undo, and keeping a swap for
// good in the weekly schedule.
import { applyMoves, dateKey, resolvePlan, undoOp, type Schedule } from '../src/lib/occurrences';
import { bringCandidates, bringChoices, bringMoves, canBring, weekAfterSwap, weekWithAdded } from '../src/lib/bring-day';
import type { LoggedWorkout } from '../src/lib/types';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
};
// Sunday 11 Oct 2026. Week: Sun Push, Mon Pull, Wed Pull, Thu Legs, Sat Full body.
const today = new Date(2026, 9, 11, 9);
const day = (n: number) => new Date(2026, 9, 11 + n, 12);
const key = (n: number) => dateKey(day(n));
const schedule: Schedule = {
  0: { title: 'Push day', exerciseIds: ['bench', 'ohp'] },
  1: { title: 'Pull day', exerciseIds: ['row', 'pulldown'] },
  3: { title: 'Pull day', exerciseIds: ['row', 'curl'] },
  4: { title: 'Leg day', exerciseIds: ['squat', 'legpress'] },
  6: { title: 'Full body', exerciseIds: ['deadlift'] },
};
const logged = (n: number, id: string): LoggedWorkout => ({ id: `w${n}${id}`, at: day(n).toISOString(), exerciseId: id, exerciseName: id, type: 'weight_reps', sets: [{ weightKg: 50, reps: 8, done: true }] });
// Last Monday (-6) trained; last Wednesday (-4) missed; Thursday (-3) trained; Saturday (-1) missed.
const workouts = [logged(-6, 'row'), logged(-3, 'squat')];

const list = bringCandidates(schedule, {}, workouts, {}, today);
const at = (n: number) => list.find((c) => c.date === key(n));
check('a trained day is listed as done', at(-6)?.status === 'done' && at(-3)?.status === 'done');
check('a missed day is listed as missed', at(-4)?.status === 'missed' && at(-1)?.status === 'missed');
check('upcoming workout days and rest days', at(4)?.status === 'upcoming' && at(2)?.status === 'rest' && at(1)?.status === 'upcoming');
check('today is not in the list', !list.some((c) => c.date === dateKey(today)));
check('done and rest days cannot be picked', !canBring(at(-6)!) && !canBring(at(2)!) && canBring(at(4)!) && canBring(at(-4)!));
check('oldest first', list[0].date === key(-6) && list[list.length - 1].date === key(6));

const todayPlan = resolvePlan(schedule, {}, today);
const thu = at(4)!;
check('upcoming + today has a workout: Swap or Just replace', bringChoices(thu, todayPlan).join() === 'swap,replace');
check('upcoming + rest day: Swap or Just add', bringChoices(thu, null).join() === 'swap,add');
check('missed + today has a workout: replace only', bringChoices(at(-4)!, todayPlan).join() === 'replace');
check('missed + rest day: just move it', bringChoices(at(-4)!, null).join() === 'move');

const apply = (moves: ReturnType<typeof bringMoves>, occ = {}) => applyMoves(occ, moves, {}, 'op1', today.toISOString())!;

// Swap: Leg day today, Push day on Thursday.
let occ = apply(bringMoves('swap', thu, today, todayPlan));
check('swap: Leg day today', resolvePlan(schedule, occ, today)?.day.title === 'Leg day');
check('swap: Push day on Thursday', resolvePlan(schedule, occ, day(4))?.day.title === 'Push day');
let undone = undoOp(occ, schedule, [], 'op1')!;
check('swap undone: back to normal', resolvePlan(schedule, undone, today)?.day.title === 'Push day' && resolvePlan(schedule, undone, day(4))?.day.title === 'Leg day' && Object.keys(undone).length === 0, JSON.stringify(undone));

// Just replace today: Leg day today, Thursday still Leg day, Push skipped this time.
occ = apply(bringMoves('replace', thu, today, todayPlan));
const rep = resolvePlan(schedule, occ, today);
check('replace: Leg day today, as a stand-in', rep?.day.title === 'Leg day' && rep.standIn === true, JSON.stringify(rep));
check('replace: Thursday keeps Leg day', resolvePlan(schedule, occ, day(4))?.day.title === 'Leg day');
check('replace: next Sunday is Push day again', resolvePlan(schedule, occ, day(7))?.day.title === 'Push day');
undone = undoOp(occ, schedule, [], 'op1')!;
check('replace undone: Push day today again, no record left', resolvePlan(schedule, undone, today)?.day.title === 'Push day' && Object.keys(undone).length === 0, JSON.stringify(undone));

// Rest day: swap moves it (Thursday becomes rest); add keeps Thursday.
occ = apply(bringMoves('swap', thu, today, null));
check('rest day swap: Thursday becomes rest', resolvePlan(schedule, occ, day(4)) === null);
occ = apply(bringMoves('add', thu, today, null));
check('rest day add: Thursday stays Leg day', resolvePlan(schedule, occ, day(4))?.day.title === 'Leg day' && resolvePlan(schedule, occ, today)?.day.title === 'Leg day');

// Missed Wednesday with today's Push: Pull today, Push skipped this time.
occ = apply(bringMoves('replace', at(-4)!, today, todayPlan));
check('missed replace: Pull day today', resolvePlan(schedule, occ, today)?.day.title === 'Pull day');
check('missed replace: no longer missed', bringCandidates(schedule, occ, workouts, {}, today).find((c) => c.date === key(-4)) === undefined);

// Keep a swap for good.
const week = weekAfterSwap(schedule, today, thu, todayPlan);
check('kept swap: Sundays are Leg day, Thursdays Push day', week[0]?.title === 'Leg day' && week[4]?.title === 'Push day' && week[1]?.title === 'Pull day');
check('kept swap: the original schedule is not changed', schedule[0].title === 'Push day');
const restWeek = weekAfterSwap(schedule, today, thu, null);
check('kept rest-day swap: Thursday becomes rest', restWeek[0]?.title === 'Leg day' && restWeek[4] === undefined);

// Added exercises kept for good.
const added = weekWithAdded(schedule, 0, ['fly', 'bench']);
check('added: appended once to Push day', added[0].exerciseIds.join() === 'bench,ohp,fly' && added[0].title === 'Push day');
check('added to a rest day: it becomes a workout day', weekWithAdded(schedule, 2, ['fly'])[2]?.exerciseIds.join() === 'fly');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
