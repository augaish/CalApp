// Saving a new schedule keeps the week it replaces exactly once.
import { sameWeek, useAppStore } from '../src/lib/store';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
};
type Week = ReturnType<typeof useAppStore.getState>['schedule'];
const upper: Week = { 0: { title: 'Upper', exerciseIds: ['a', 'b'], plans: {} }, 2: { title: 'Lower', exerciseIds: ['c'] } };
const ai: Week = { 1: { title: 'Push', exerciseIds: ['x'], plans: {} } };
const names = { name: 'AI plan · Oct 17', previous: 'Before AI plan · Oct 17' };
const start = (schedule: Week, saved: { id: string; name: string; days: Week }[], active: string | null) =>
  useAppStore.setState({ schedule, savedSchedules: saved.map((x) => ({ ...x, createdAt: '2026-10-01T00:00:00Z' })), activeScheduleId: active });
const names_ = () => useAppStore.getState().savedSchedules.map((x) => x.name).join(' | ');

check('sameWeek ignores undefined fields and empty days', sameWeek(upper, JSON.parse(JSON.stringify({ ...upper, 5: { exerciseIds: [] } }))));
check('sameWeek sees a changed exercise', !sameWeek(upper, { ...upper, 2: { title: 'Lower', exerciseIds: ['d'] } }));

// 1. The active schedule, unchanged: no copy.
start(upper, [{ id: 's1', name: 'Upper lower 4 days', days: upper }], 's1');
useAppStore.getState().applyWeekChange(ai, 'new', names);
check('active and unchanged: only the new one is added', names_() === 'Upper lower 4 days | AI plan · Oct 17', names_());

// 2. The active schedule with edits since: the edits go into it, no copy.
const edited: Week = { ...upper, 4: { title: 'Arms', exerciseIds: ['e'] } };
start(edited, [{ id: 's1', name: 'Upper lower 4 days', days: upper }], 's1');
useAppStore.getState().applyWeekChange(ai, 'new', names);
const s = useAppStore.getState();
check('active with edits: saved into it, no copy', names_() === 'Upper lower 4 days | AI plan · Oct 17', names_());
check('… and it holds the edited week', sameWeek(s.savedSchedules[0].days, edited));
check('the new one is active', s.savedSchedules.find((x) => x.id === s.activeScheduleId)?.name === 'AI plan · Oct 17');

// 3. Nothing active, but the week is saved word for word: no copy.
start(upper, [{ id: 's1', name: 'Upper lower 4 days', days: upper }], null);
useAppStore.getState().applyWeekChange(ai, 'new', names);
check('no active, same as a saved one: no copy', names_() === 'Upper lower 4 days | AI plan · Oct 17', names_());

// 4. A week saved nowhere: kept as "Before …".
start(edited, [{ id: 's1', name: 'Upper lower 4 days', days: upper }], null);
useAppStore.getState().applyWeekChange(ai, 'new', names);
check('saved nowhere: kept once as Before …', names_() === 'Upper lower 4 days | Before AI plan · Oct 17 | AI plan · Oct 17', names_());

// 5. An empty week: nothing to keep.
start({}, [], null);
useAppStore.getState().applyWeekChange(ai, 'new', names);
check('empty week: only the new one', names_() === 'AI plan · Oct 17', names_());

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
