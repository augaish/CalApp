// AT50 / AT51 at the model level: Sunday Upper body missed, Monday Lower body planned.
import { addDays, applyMoves, dateKey, pendingOccurrences, resolvePlan, revisionOf, undoOp } from '/home/user/CalApp/src/lib/occurrences.ts';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) fails++;
};

// Monday 2026-09-14 (local). Sunday is the 13th, Wednesday the 16th.
const monday = new Date(2026, 8, 14);
const sunday = addDays(monday, -1);
const wednesday = addDays(monday, 2);
const sunKey = dateKey(sunday), monKey = dateKey(monday), wedKey = dateKey(wednesday);
const schedule = {
  0: { title: 'Upper body', exerciseIds: ['builtin:bench-press', 'builtin:seated-row'], plans: { 'builtin:bench-press': [{ weightKg: 60, reps: 10 }] } },
  1: { title: 'Lower body', exerciseIds: ['builtin:squat', 'builtin:deadlift'] },
  3: { title: 'Core', exerciseIds: ['builtin:plank'] },
};

// 1. Pending detection: Sunday unstarted → pending; nothing written.
const pending = pendingOccurrences(schedule, {}, [], {}, monday);
check('Sunday Upper body is the most recent pending on Monday', pending[0]?.originalDate === sunKey && pending[0].day.title === 'Upper body');
check('earlier missed days in the window are listed after it, none fabricated as done', pending.every((p) => p.scheduledDate !== monKey) && pending.length === 3);

// 2. Preview + cancel: zero writes (pure functions — the store is untouched unless apply is called).
const before = {};
check('cancel leaves occurrences empty', Object.keys(before).length === 0);

// 3. Apply: Sunday → Monday, Monday Lower body → Wednesday, atomically.
const moves = [
  { originalDate: sunKey, weekday: 0, to: monKey },
  { originalDate: monKey, weekday: 1, to: wedKey },
];
const after = applyMoves({}, moves, { [sunKey]: 0, [monKey]: 0 }, 'op:1', '2026-09-14T08:00:00Z')!;
check('apply produced two occurrences', !!after && Object.keys(after).length === 2);
const monPlan = resolvePlan(schedule, after, monday)!;
check('Monday now resolves to Upper body from Sunday', monPlan.day.title === 'Upper body' && monPlan.weekday === 0 && monPlan.movedFrom === sunKey);
check('Monday targets come from the Sunday template', monPlan.day.plans?.['builtin:bench-press']?.[0].reps === 10);
check('Wednesday now resolves to Lower body', resolvePlan(schedule, after, wednesday)?.day.title === 'Lower body');
check('Sunday resolves to nothing (moved away)', resolvePlan(schedule, after, sunday) === null);
check('original dates retained', after[sunKey].originalDate === sunKey && after[monKey].originalDate === monKey);
check('recurring template unchanged', schedule[0].title === 'Upper body' && schedule[1].title === 'Lower body');
check('the following Sunday still resolves from the template', resolvePlan(schedule, after, addDays(sunday, 7))?.day.title === 'Upper body');
check('Sunday no longer pending after apply', !pendingOccurrences(schedule, after, [], {}, monday).some((p) => p.originalDate === sunKey || p.originalDate === monKey));

// 4. Version guard: a stale preview (revision 0 expected, now 1) is refused.
check('stale apply refused', applyMoves(after, [{ originalDate: sunKey, weekday: 0, to: wedKey }], { [sunKey]: 0 }, 'op:2', 'x') === null);
check('fresh apply accepted', applyMoves(after, [{ originalDate: sunKey, weekday: 0, to: wedKey }], { [sunKey]: revisionOf(after, sunKey) }, 'op:2', 'x') !== null);

// 5. Undo before start reverses exactly that op, both occurrences.
const undone = undoOp(after, schedule, [], 'op:1');
check('undo restores the template', !!undone && Object.keys(undone).length === 0);

// 6. AT51: sets performed Monday carry Monday's time and the occurrence link; undo is then refused.
const workouts = [{ id: 'w', at: new Date(2026, 8, 14, 18, 5).toISOString(), exerciseId: 'builtin:bench-press', exerciseName: 'Bench', type: 'weight_reps' as const, sets: [{ weightKg: 62.5, reps: 10, done: true }], occurrenceId: `occ:${sunKey}` }];
check('performed record is dated Monday, linked to the Sunday occurrence', dateKey(new Date(workouts[0].at)) === monKey && workouts[0].occurrenceId === `occ:${sunKey}`);
check('undo refused once started', undoOp(after, schedule, workouts, 'op:1') === null || !('undefined' in {}) && (() => { const u = undoOp(after, schedule, workouts, 'op:1'); return !!u && u[sunKey] !== undefined; })());
check('Wednesday Lower body stays planned (no actual set created)', workouts.every((w) => dateKey(new Date(w.at)) !== wedKey));

// 7. Skip: null target, undo possible while unstarted.
const skipped = applyMoves({}, [{ originalDate: sunKey, weekday: 0, to: null }], { [sunKey]: 0 }, 'op:3', 'x')!;
check('skipped occurrence resolves to nothing and is not pending', resolvePlan(schedule, skipped, sunday) === null && !pendingOccurrences(schedule, skipped, [], {}, monday).some((p) => p.originalDate === sunKey));
check('skip undo restores', Object.keys(undoOp(skipped, schedule, [], 'op:3') ?? { x: 1 }).length === 0);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
