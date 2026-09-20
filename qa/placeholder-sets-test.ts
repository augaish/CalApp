// A day's record can hold rows nobody lifted (a preview of last time, an
// unticked exercise). A real set must replace the preview, never join it,
// and the v14 migration repairs records that were already doubled.
import { migrateStore, useAppStore, workoutFor } from '/home/user/CalApp/src/lib/store';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const EX = { id: 'builtin:bench-press', name: 'Barbell Bench Press', type: 'weight_reps' as const, category: 'chest' as const };
const today = new Date();
const iso = (h: number) => {
  const d = new Date(today);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
const sets = (w: string) => w.split(',').map((s) => s.trim());
const show = (id: string) => (workoutFor(useAppStore.getState().workouts, id, today)?.sets ?? []).map((s) => `${s.weightKg}x${s.reps}${s.done ? '' : '?'}`).join(',');

// ── 1. A preview record (all rows unlifted) is replaced by the first real set ──
useAppStore.setState({
  workouts: [
    { id: 'p', at: iso(9), updatedAt: iso(9), exerciseId: EX.id, exerciseName: EX.name, type: 'weight_reps', caloriesBurned: 0,
      sets: [{ weightKg: 28, reps: 12, done: false }, { weightKg: 32, reps: 10, done: false }, { weightKg: 36, reps: 8, done: false }] },
  ],
  activeSession: null,
});
useAppStore.getState().logSet(EX, { weightKg: 28, reps: 12, done: true }, iso(10));
check('first real set replaces the whole preview', show(EX.id) === '28x12', show(EX.id));
useAppStore.getState().logSet(EX, { weightKg: 32, reps: 12, done: true }, iso(10));
useAppStore.getState().logSet(EX, { weightKg: 36, reps: 8, done: true }, iso(10));
check('the next sets append normally', show(EX.id) === '28x12,32x12,36x8', show(EX.id));
check('still one record for the day', useAppStore.getState().workouts.filter((w) => w.exerciseId === EX.id).length === 1);
check('burn counts three sets', (useAppStore.getState().workouts[0].caloriesBurned ?? 0) > 0);

// ── 2. A mixed record (legacy) fills its placeholders in order ──
useAppStore.setState({
  workouts: [
    { id: 'm', at: iso(9), updatedAt: iso(9), exerciseId: EX.id, exerciseName: EX.name, type: 'weight_reps', caloriesBurned: 14,
      sets: [{ weightKg: 28, reps: 12, done: true }, { weightKg: 32, reps: 10, done: false }, { weightKg: 36, reps: 8, done: false }] },
  ],
});
useAppStore.getState().logSet(EX, { weightKg: 30, reps: 10, done: true }, iso(10));
check('a placeholder is filled, not appended to', show(EX.id) === '28x12,30x10,36x8?', show(EX.id));
useAppStore.getState().logSet(EX, { weightKg: 34, reps: 8, done: true }, iso(10));
useAppStore.getState().logSet(EX, { weightKg: 34, reps: 6, done: true }, iso(10));
check('once the placeholders are used up, sets append', show(EX.id) === '28x12,30x10,34x8,34x6', show(EX.id));

// ── 3. A clean record is untouched by the rule ──
useAppStore.setState({ workouts: [] });
useAppStore.getState().logSet(EX, { weightKg: 60, reps: 10, done: true }, iso(10));
useAppStore.getState().logSet(EX, { weightKg: 60, reps: 10, done: true }, iso(10));
check('two sets logged fresh are two sets', show(EX.id) === '60x10,60x10', show(EX.id));

// ── 4. v14 migration repairs the doubled day, leaves the rest alone ──
const persisted = {
  workouts: [
    { id: 'a', at: iso(9), updatedAt: iso(9), exerciseId: EX.id, exerciseName: EX.name, type: 'weight_reps', caloriesBurned: 43,
      sets: [{ weightKg: 28, reps: 12, done: false }, { weightKg: 32, reps: 10, done: false }, { weightKg: 36, reps: 8, done: false, isPR: true },
             { weightKg: 28, reps: 12, done: true }, { weightKg: 32, reps: 12, done: true }, { weightKg: 36, reps: 8, done: true }] },
    { id: 'b', at: iso(9), updatedAt: iso(9), exerciseId: 'builtin:squat', exerciseName: 'Squat', type: 'weight_reps', caloriesBurned: 0,
      sets: [{ weightKg: 80, reps: 8, done: false }, { weightKg: 80, reps: 8, done: false }] },
    { id: 'c', at: iso(9), updatedAt: iso(9), exerciseId: 'builtin:lunge', exerciseName: 'Lunge', type: 'weight_reps', caloriesBurned: 14,
      sets: [{ weightKg: 20, reps: 12, done: true, isPR: true }] },
  ],
  profile: { weightKg: 80 },
};
const out = migrateStore(JSON.parse(JSON.stringify(persisted)), 13) as { workouts: typeof persisted.workouts };
const a = out.workouts.find((w) => w.id === 'a')!;
check('mixed record keeps only the lifted sets', a.sets.map((s) => `${s.weightKg}x${s.reps}`).join(',') === '28x12,32x12,36x8', JSON.stringify(a.sets));
check('  all of them lifted', a.sets.every((s) => s.done));
check('  the trophy is re-picked among them', a.sets.filter((s) => s.isPR).length === 1 && a.sets[2].isPR === true);
check('  the burn is unchanged', a.caloriesBurned === 43);
const b = out.workouts.find((w) => w.id === 'b')!;
check('an unticked record keeps its numbers', b.sets.length === 2 && b.sets.every((s) => !s.done));
const c = out.workouts.find((w) => w.id === 'c')!;
check('a clean record is untouched', c.sets.length === 1 && c.sets[0].isPR === true);
const same = migrateStore(JSON.parse(JSON.stringify(persisted)), 14) as { workouts: typeof persisted.workouts };
check('nothing runs for a store already on v14', same.workouts.find((w) => w.id === 'a')!.sets.length === 6);

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
