// Set counting, the button's words, where the last set takes you, and the
// water sheet's learned buttons.
import { afterSet, completeLabel, DEFAULT_SETS, setGoal } from '/home/user/CalApp/src/lib/session-flow.ts';
import { DEFAULT_WATER_BUTTONS, waterButtons } from '/home/user/CalApp/src/lib/water-buttons.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ── the goal ──
eq('no plan: three sets', setGoal(0), 3);
eq('  (the default is three)', DEFAULT_SETS, 3);
eq('a plan of five: five', setGoal(5), 5);
eq('a plan of four: four', setGoal(4), 4);

// ── the button ──
eq('set 1 of 3', completeLabel(1, 3), { key: 'session.completeSetOf', n: 1, total: 3 });
eq('set 2 of 3', completeLabel(2, 3), { key: 'session.completeSetOf', n: 2, total: 3 });
eq('set 3 of 3 is the last set', completeLabel(3, 3), { key: 'session.completeLastSet', n: 3, total: 3 });
eq('past the goal it is an extra set', completeLabel(4, 3), { key: 'session.completeExtraSet', n: 4, total: 3 });
eq('a one-set goal: the first is the last', completeLabel(1, 1).key, 'session.completeLastSet');

// ── where the last set takes you ──
eq('before the last set, stay', afterSet(2, 0, [2, 0, 0], [3, 3, 3]), { kind: 'stay' });
eq('the last set moves to the next exercise', afterSet(3, 0, [3, 0, 0], [3, 3, 3]), { kind: 'next', index: 1 });
eq('an extra set after the goal stays put', afterSet(4, 0, [4, 0, 0], [3, 3, 3]), { kind: 'stay' });
eq('a finished next exercise is skipped over', afterSet(3, 0, [3, 3, 0], [3, 3, 3]), { kind: 'next', index: 2 });
eq('from the last exercise, back round to one left unfinished', afterSet(3, 2, [1, 3, 3], [3, 3, 3]), { kind: 'next', index: 0 });
eq('everything done: finish', afterSet(3, 2, [3, 3, 3], [3, 3, 3]), { kind: 'finish' });
eq('a single-exercise day finishes on its last set', afterSet(3, 0, [3], [3]), { kind: 'finish' });
eq('the plan\'s own count decides (five sets)', afterSet(3, 0, [3, 0], [5, 3]), { kind: 'stay' });
eq('  and its fifth moves on', afterSet(5, 0, [5, 0], [5, 3]), { kind: 'next', index: 1 });
eq('a run (goal one) moves on when logged', afterSet(1, 1, [3, 1, 0], [3, 1, 3]), { kind: 'next', index: 2 });

// ── water buttons ──
const now = new Date('2026-09-23T12:00:00');
const at = (daysAgo: number, h = 10) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h); return d.toISOString(); };
eq('the defaults are 250, 330, 500', DEFAULT_WATER_BUTTONS, [250, 330, 500]);
eq('a new person sees the defaults', waterButtons([], now), [250, 330, 500]);
const bottle = [0, 1, 2, 3, 4].map((d) => ({ at: at(d), ml: 600 }));
eq('600 ml logged on five days becomes a button', waterButtons(bottle, now), [330, 500, 600]);
const oneAfternoon = [0, 0, 0, 0, 0, 0].map((_, i) => ({ at: at(0, 9 + i), ml: 600 }));
eq('six logs in one afternoon do not (it has to be a habit)', waterButtons(oneAfternoon, now), [250, 330, 500]);
const old = [40, 41, 42, 43, 44].map((d) => ({ at: at(d), ml: 600 }));
eq('a habit from over a month ago has lapsed', waterButtons(old, now), [250, 330, 500]);
const mixed = [
  ...[0, 1, 2, 3, 4, 5].map((d) => ({ at: at(d), ml: 250 })),
  ...[0, 1, 2, 3, 4].map((d) => ({ at: at(d, 14), ml: 330 })),
  ...[0, 1, 2, 3, 4].map((d) => ({ at: at(d, 16), ml: 600 })),
];
eq('the least-used default gives way, the used ones stay', waterButtons(mixed, now), [250, 330, 600]);
const tie = [
  ...[0, 1, 2, 3, 4].map((d) => ({ at: at(d), ml: 250 })),
  ...[0, 1, 2, 3, 4].map((d) => ({ at: at(d, 12), ml: 330 })),
  ...[0, 1, 2, 3, 4].map((d) => ({ at: at(d, 14), ml: 500 })),
  ...[0, 1, 2, 3, 4].map((d) => ({ at: at(d, 16), ml: 750 })),
];
eq('a habit no more frequent than every default does not push one out', waterButtons(tie, now), [250, 330, 500]);
const two = [
  ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ at: at(d), ml: 600 })),
  ...[0, 1, 2, 3, 4].map((d) => ({ at: at(d, 15), ml: 1000 })),
];
eq('two habits can take two places', waterButtons(two, now), [500, 600, 1000]);
eq('odd amounts are rounded to the same button', waterButtons([0, 1, 2, 3, 4].map((d) => ({ at: at(d), ml: 599.6 })), now), [330, 500, 600]);

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
