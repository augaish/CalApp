// Missed workouts count only from when a weekday got its workout: a schedule
// made on Tuesday never offers last Sunday as missed (R03), while a workout
// that really was missed still is.
import { dateKey, pendingOccurrences, sinceAfter } from '../src/lib/occurrences';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
};
const tue = new Date(2026, 9, 6, 16); // Tuesday 6 Oct 2026
const sun = new Date(2026, 9, 4, 12);
const sat = new Date(2026, 9, 3, 12);
const day = (ids: string[]) => ({ exerciseIds: ids, plans: {} });

// Before: Saturday legs only. Tuesday: Sunday push-ups added.
const before = { 6: day(['squat']) };
const after = { 6: day(['squat']), 0: day(['pushup']) };
const since = sinceAfter(before, after, {}, tue);
check('adding Sunday on Tuesday dates Sunday from today', since[0] === dateKey(tue) && since[6] === undefined, JSON.stringify(since));
const pending = pendingOccurrences(after, {}, [], {}, tue, 7, since);
check('last Sunday is not offered as missed', !pending.some((p) => p.scheduledDate === dateKey(sun)), JSON.stringify(pending.map((p) => p.scheduledDate)));
check('Saturday, untouched and not trained, still is', pending.some((p) => p.scheduledDate === dateKey(sat)));
check('without start dates, behaviour is as before', pendingOccurrences(after, {}, [], {}, tue, 7).some((p) => p.scheduledDate === dateKey(sun)));

// Reordering or removing does not reset; a new exercise on the day does.
check('reorder keeps the date', sinceAfter({ 6: day(['a', 'b']) }, { 6: day(['b', 'a']) }, {}, tue)[6] === undefined);
check('removing keeps the date', sinceAfter({ 6: day(['a', 'b']) }, { 6: day(['a']) }, {}, tue)[6] === undefined);
check('unchanged returns the same object', sinceAfter(before, before, since, tue) === since);

// A week later, the Sunday after the change is a real miss.
const nextTue = new Date(2026, 9, 13, 16);
const later = pendingOccurrences(after, {}, [], {}, nextTue, 7, since);
check('the Sunday after it counts as missed', later.some((p) => p.scheduledDate === dateKey(new Date(2026, 9, 11, 12))));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
