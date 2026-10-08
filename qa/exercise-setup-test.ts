// "My setup": which exercises offer it, how saving keeps dated versions, which
// version a workout was done with, and what History calls a change.
import { BUILTIN_EXERCISES } from '../src/lib/exercises';
import { currentSetup, setupChanges, setupKindFor, setupOn, setupSince, withSetup } from '../src/lib/exercise-setup';
import type { Exercise, SetupVersion } from '../src/lib/types';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
};
const builtin = (id: string) => BUILTIN_EXERCISES.find((e) => e.id === `builtin:${id}`)!;
const custom = (name: string, source: Exercise['source'] = 'custom'): Exercise => ({ id: `c-${name}`, name, category: 'chest', type: 'weight_reps', source });

// ── Which exercises offer it up front ──
check('leg press is a machine', setupKindFor(builtin('leg-press')) === 'machine');
check('lat pulldown is a cable station', setupKindFor(builtin('lat-pulldown')) === 'cable');
check('incline bench is a bench', setupKindFor(builtin('incline-bench')) === 'bench');
check('squat is a rack', setupKindFor(builtin('squat')) === 'rack');
check('assisted pull-up machine is assisted', setupKindFor(builtin('assisted-pull-up-machine')) === 'assisted');
check('push-ups offer nothing', setupKindFor(builtin('push-up')) === null);
check('dumbbell curls offer nothing', setupKindFor(builtin('dumbbell-curl')) === null);
check('the treadmill offers nothing (cardio is separate)', setupKindFor(builtin('treadmill')) === null);
check('every machine-kind id exists in the library', ['leg-press', 'hip-adductor', 'wrist-curl-cable', 'close-grip-bench', 'assisted-dip-machine'].every((id) => !!builtin(id)));
check('a custom "Hammer Strength Row Machine" is a machine', setupKindFor(custom('Hammer Strength Row Machine')) === 'machine');
check('a custom "كابل صدر" is a cable station', setupKindFor(custom('كابل صدر')) === 'cable');
check('a scanned machine is a machine', setupKindFor(custom('Glute Drive', 'scan')) === 'machine');
check('a custom "Farmer carry" offers nothing', setupKindFor(custom('Farmer carry')) === null);

// ── Saving keeps dated versions ──
const sep22 = new Date(2026, 8, 22, 18).toISOString();
const sep29 = new Date(2026, 8, 29, 18).toISOString();
const oct6 = new Date(2026, 9, 6, 18).toISOString();
const oct6late = new Date(2026, 9, 6, 19).toISOString();
let v: SetupVersion[] | null = withSetup(undefined, [{ key: 'seat', value: '5' }, { key: 'backPad', value: '2' }, { key: 'feet', value: '  ' }], sep22);
check('first save keeps only settings with a value', v?.length === 1 && v[0].fields.length === 2, JSON.stringify(v));
check('nothing to save is no change', withSetup(undefined, [{ key: 'seat', value: '' }], sep22) === null);
check('saving the same again is no change', withSetup(v!, [{ key: 'seat', value: '5' }, { key: 'backPad', value: '2' }], sep29) === null);
check('an "Other" setting needs a name', withSetup(v!, [{ key: 'seat', value: '5' }, { key: 'backPad', value: '2' }, { key: 'other', label: ' ', value: 'B' }], sep29) === null);
v = withSetup(v!, [{ key: 'seat', value: '5' }, { key: 'backPad', value: '2' }, { key: 'feet', value: 'high, wide' }], sep29)!;
check('a change on another day adds a version', v.length === 2);
v = withSetup(v, [{ key: 'seat', value: '4' }, { key: 'backPad', value: '2' }, { key: 'feet', value: 'high, wide' }], oct6)!;
const v3 = withSetup(v, [{ key: 'seat', value: '3' }, { key: 'backPad', value: '2' }, { key: 'feet', value: 'high, wide' }], oct6late)!;
check('a second change the same day replaces that day', v3.length === 3 && v3[2].fields[0].value === '3', JSON.stringify(v3.map((x) => x.fields[0].value)));
const back = withSetup(v3, [{ key: 'seat', value: '5' }, { key: 'backPad', value: '2' }, { key: 'feet', value: 'high, wide' }], oct6late)!;
check('changing it back the same day leaves no change behind', back.length === 2 && setupSince(back) === sep29, JSON.stringify(back.map((x) => x.at)));
check('current setup is the last version', currentSetup(v)?.fields[0].value === '4');
check('"Same since" is when it became this', setupSince(v) === oct6);
const cleared = withSetup(v, [], new Date(2026, 9, 8).toISOString())!;
check('removing every setting clears the setup, keeping history', currentSetup(cleared) === undefined && cleared.length === 4);

// ── Which version a workout used ──
check('before any setup: none', setupOn(v, new Date(2026, 8, 20, 9).toISOString()) === undefined);
check('the day it was saved counts', setupOn(v, new Date(2026, 8, 22, 7).toISOString())?.fields[0].value === '5');
check('a workout between changes reads the older one', setupOn(v, new Date(2026, 9, 1, 18).toISOString())?.fields.length === 3);
check('the day of a change reads the new one', setupOn(v, new Date(2026, 9, 6, 8).toISOString())?.fields[0].value === '4');
check('after clearing: none', setupOn(cleared, new Date(2026, 9, 9).toISOString()) === undefined);

// ── What History calls a change ──
const ch = setupChanges(v[1].fields, v[2].fields);
check('Seat 5 → 4', ch.length === 1 && ch[0].field.key === 'seat' && ch[0].from === '5' && ch[0].to === '4', JSON.stringify(ch));
const added = setupChanges(v[0].fields, v[1].fields);
check('a new setting reads as added', added.length === 1 && added[0].field.key === 'feet' && added[0].from === undefined, JSON.stringify(added));
const removed = setupChanges(v[1].fields, v[0].fields);
check('a dropped setting reads as removed', removed.length === 1 && removed[0].to === undefined);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
