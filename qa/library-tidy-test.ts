// Custom exercises filed under Full body for want of a better answer: the
// name-based guess, the exact-twin fold, and the v15 migration that applies
// both to a library already on the phone.
import { exactExerciseMatch, guessCategory } from '/home/user/CalApp/src/lib/exercises';
import { migrateStore, tidyLibraryState, useAppStore } from '/home/user/CalApp/src/lib/store';
import { resolveCoachSchedule } from '/home/user/CalApp/src/lib/coach-schedule';
import type { Exercise, LoggedWorkout } from '/home/user/CalApp/src/lib/types';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) => check(label, got === want, `got=${String(got)} want=${String(want)}`);

// ── guessCategory ──
const cases: [string, string | null][] = [
  ['سحب علوي', 'back'], ['سحب أرضي بالكابل', 'back'], ['Seated cable row', 'back'], ['T-bar row', 'back'], ['Straight arm pulldown', 'back'],
  ['Shoulder press machine', 'shoulders'], ['ضغط كتف بالدمبل', 'shoulders'], ['Lateral raise', 'shoulders'], ['رفرفة جانبية', 'shoulders'],
  ['Incline dumbbell chest press', 'chest'], ['رفرفة صدر', 'chest'], ['Cable crossover', 'chest'], ['ضغط بنش', 'chest'],
  ['Leg press', 'legs'], ['Leg curl', 'legs'], ['Leg extension', 'legs'], ['سكوات بالبار', 'legs'], ['Romanian deadlift', 'legs'],
  ['Hammer curl', 'biceps'], ['ثني الذراع بالبار', 'biceps'], ['Preacher curl', 'biceps'],
  ['Tricep pushdown', 'triceps'], ['Overhead tricep extension', 'triceps'], ['Tricep kickback', 'triceps'], ['ترايسبس بالكابل', 'triceps'],
  ['Wrist curl', 'forearms'], ['Standing calf raise', 'calves'], ['Hip thrust', 'glutes'], ['Glute kickback', 'glutes'],
  ['Hanging leg raise', 'core'], ['بلانك', 'core'], ['Cable crunch', 'core'],
  ['Treadmill walk', 'cardio'], ['جري على السير', 'cardio'], ['Rowing machine', 'cardio'], ['Padel', 'cardio'],
  ['Machine 7', null], ['XYZ', null], ['', null],
];
for (const [name, want] of cases) eq(`guess "${name}"`, guessCategory(name), want);

// ── exact twin only, no containment ──
eq('exact: سحب علوي is the built-in lat pulldown', exactExerciseMatch('سحب علوي', [])?.id, 'builtin:lat-pulldown');
eq('exact: "Smith machine squat" is nobody\'s twin', exactExerciseMatch('Smith machine squat', [])?.id, undefined);

// ── a coach plan files unknown names by their name ──
const plan = { summary: 'x', days: [{ weekday: 1, title: 'Pull', exercises: [{ name: 'سحب علوي بقبضة واسعة جداً', sets: 3, reps: '10' }, { name: 'Machine 7', sets: 3, reps: '10' }] }] };
const resolved = resolveCoachSchedule(plan, [], {});
const byName = (n: string) => resolved.newExercises.find((e) => e.name === n);
eq('coach: an unmatched pulldown is filed under back', byName('سحب علوي بقبضة واسعة جداً')?.category ?? 'matched', byName('سحب علوي بقبضة واسعة جداً') ? 'back' : 'matched');
eq('coach: a meaningless name still lands in fullBody', byName('Machine 7')?.category, 'fullBody');

// ── v15 migration on a library like the one reported ──
const today = new Date();
const iso = (d: number, h = 18) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const exercises: Exercise[] = [
  { id: 'custom:a', name: 'سحب علوي', category: 'fullBody', type: 'weight_reps', source: 'custom' },
  { id: 'custom:b', name: 'Seated cable row wide', category: 'fullBody', type: 'weight_reps', source: 'custom' },
  { id: 'custom:c', name: 'Machine 7', category: 'fullBody', type: 'weight_reps', source: 'scan' },
  { id: 'custom:d', name: 'Cable chin dip', category: 'fullBody', type: 'weight_reps', source: 'scan', primaryMuscles: ['lats', 'biceps'] },
  { id: 'custom:e', name: 'Burpee circuit', category: 'fullBody', type: 'weight_reps', source: 'custom', primaryMuscles: ['quads', 'chest', 'abs', 'front_delts'] },
  { id: 'custom:f', name: 'Plank', category: 'fullBody', type: 'weight_reps', source: 'custom' },
  { id: 'custom:h', name: 'Plank', category: 'fullBody', type: 'time', source: 'custom' },
  { id: 'custom:g', name: 'My press', category: 'chest', type: 'weight_reps', source: 'custom' },
];
const workouts: LoggedWorkout[] = [
  { id: 'w1', at: iso(3), updatedAt: iso(3), exerciseId: 'custom:a', exerciseName: 'سحب علوي', type: 'weight_reps', caloriesBurned: 20, sets: [{ weightKg: 55, reps: 12, done: true }, { weightKg: 60, reps: 9, done: true, isPR: true }] },
  { id: 'w2', at: iso(3), updatedAt: iso(3), exerciseId: 'builtin:lat-pulldown', exerciseName: 'Lat Pulldown', type: 'weight_reps', caloriesBurned: 10, sets: [{ weightKg: 65, reps: 4, done: true }] },
];
const persisted = {
  exercises, workouts,
  schedule: { 1: { title: 'Pull', exerciseIds: ['custom:a', 'builtin:lat-pulldown', 'custom:b'], plans: { 'custom:a': [{ weightKg: 55, reps: 12 }] } } },
  savedSchedules: [{ id: 'sched:x', name: 'Gym', days: { 1: { exerciseIds: ['custom:a'] } }, createdAt: iso(10) }],
  skips: { '2026-8-19': ['custom:a'] }, dayOrder: { '2026-8-19': ['custom:a', 'custom:b'] },
  activeSession: { startedAt: iso(0), dayKey: '2026-8-20', exerciseIds: ['custom:a', 'custom:b'], index: 0, restEndsAt: null, restSeconds: 90 },
  profile: { weightKg: 80 },
};
const out = migrateStore(JSON.parse(JSON.stringify(persisted)), 14) as typeof persisted;
const ex = (id: string) => out.exercises.find((e) => e.id === id);
check('the twin of Lat Pulldown is folded into it and gone', !ex('custom:a'));
check('  its history now belongs to the built-in', out.workouts.filter((w) => w.exerciseId === 'builtin:lat-pulldown').length === 2 && !out.workouts.some((w) => w.exerciseId === 'custom:a'));
check('  the weekly plan lists the built-in once, in the twin\'s slot', JSON.stringify(out.schedule[1].exerciseIds) === '["builtin:lat-pulldown","custom:b"]', JSON.stringify(out.schedule[1].exerciseIds));
check('  planned sets followed', JSON.stringify(out.schedule[1].plans) === '{"builtin:lat-pulldown":[{"weightKg":55,"reps":12}]}', JSON.stringify(out.schedule[1].plans));
check('  the saved schedule followed too', JSON.stringify(out.savedSchedules[0].days[1].exerciseIds) === '["builtin:lat-pulldown"]');
check('  skips, day order and the live session followed', out.skips['2026-8-19'][0] === 'builtin:lat-pulldown' && out.dayOrder['2026-8-19'][0] === 'builtin:lat-pulldown' && out.activeSession.exerciseIds[0] === 'builtin:lat-pulldown');
eq('a near-match ("Seated cable row wide") is re-filed under back, kept as its own entry', ex('custom:b')?.category, 'back');
check('  and inherits the near-match\'s muscles for the map', (ex('custom:b')?.primaryMuscles?.length ?? 0) > 0, JSON.stringify(ex('custom:b')?.primaryMuscles));
eq('a meaningless name stays in fullBody', ex('custom:c')?.category, 'fullBody');
eq('a scan with identified muscles is filed by them', ex('custom:d')?.category, 'back');
eq('a genuine whole-body movement stays', ex('custom:e')?.category, 'fullBody');
eq('a rep-counted "Plank" is not folded into the timed built-in, but is re-filed to core', ex('custom:f')?.category, 'core');
check('a timed "Plank" IS the built-in and is folded into it', !ex('custom:h'));
check('  and still exists', !!ex('custom:f'));
eq('an entry already filed elsewhere is untouched', ex('custom:g')?.category, 'chest');
check('running it again changes nothing', tidyLibraryState({ ...out, profile: { weightKg: 80 } } as never) === null);

// ── the store action still merges the same way ──
useAppStore.setState({ exercises: [{ id: 'custom:z', name: 'Zed row', category: 'back', type: 'weight_reps', source: 'custom' }], workouts: [{ id: 'wz', at: iso(1), updatedAt: iso(1), exerciseId: 'custom:z', exerciseName: 'Zed row', type: 'weight_reps', caloriesBurned: 5, sets: [{ weightKg: 40, reps: 10, done: true }] }], schedule: {}, savedSchedules: [], skips: {}, dayOrder: {}, activeSession: null });
useAppStore.getState().mergeExercise('custom:z', 'builtin:seated-row');
check('mergeExercise action: entry gone, history moved', useAppStore.getState().exercises.length === 0 && useAppStore.getState().workouts[0].exerciseId === 'builtin:seated-row');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
