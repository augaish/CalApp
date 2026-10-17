// Moving a weekday's workout: onto a rest day it moves, onto a training day
// the two swap; moving it back undoes either.
import { moveKind, moveWeekday } from '../src/lib/move-day';
import { sameWeek } from '../src/lib/store';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
};
const week = {
  1: { title: 'Push', exerciseIds: ['bench', 'ohp'], plans: { bench: [{ weightKg: 70, reps: 8 }] } },
  3: { title: 'Pull', exerciseIds: ['row'] },
  5: { title: 'Legs', exerciseIds: ['squat'] },
};

const moved = moveWeekday(week, 1, 0);
check('Mon → Sun (rest): Sunday gets Push', moved[0]?.title === 'Push' && moved[0]?.exerciseIds.join() === 'bench,ohp');
check('… Monday becomes rest', !moved[1]);
check('… planned sets travel with it', moved[0]?.plans?.bench?.[0]?.weightKg === 70);
check('… other days untouched', moved[3]?.title === 'Pull' && moved[5]?.title === 'Legs');
check('moving back undoes it', sameWeek(moveWeekday(moved, 0, 1), week));
check('rest target reads as a move', moveKind(week, 0) === 'move');

const swapped = moveWeekday(week, 1, 3);
check('Mon ↔ Wed (training): they swap', swapped[3]?.title === 'Push' && swapped[1]?.title === 'Pull');
check('training target reads as a swap', moveKind(week, 3) === 'swap');
check('swapping back undoes it', sameWeek(moveWeekday(swapped, 3, 1), week));

check('a day with no workout moves nothing', moveWeekday(week, 2, 4) === week);
check('the same day moves nothing', moveWeekday(week, 1, 1) === week);
check('the input week is not changed', week[1].title === 'Push' && !('0' in week));
const emptyTitle = moveWeekday({ 2: { exerciseIds: ['x'] }, 4: { exerciseIds: [] } }, 2, 4);
check('an empty day counts as rest', emptyTitle[4]?.exerciseIds.join() === 'x' && !emptyTitle[2]);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
