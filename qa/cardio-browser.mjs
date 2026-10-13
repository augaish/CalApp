// Treadmill and cardio settings in the exported web app, English and
// Arabic: last time with Same again, settings prefilled, distance from speed
// × time, the incline in the estimate, what is saved, the stair climber's
// level with "+1 from last time", and History reading the machine's way.
// Needs the web build on :8099 (the API is not needed).
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/cardio-shots';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const western = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.');
const today = new Date();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ago = (n, h = 18) => { const x = new Date(today); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x; };
const T = 'builtin:treadmill';
const S = 'builtin:stair-climber';
const w = (id, exId, n, set) => ({ id, at: ago(n).toISOString(), exerciseId: exId, exerciseName: exId, type: exId === T ? 'distance_time' : 'time', caloriesBurned: 0, sets: [{ ...set, done: true }] });

const state = (language, extra = {}) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: { [today.getDay()]: { title: 'Cardio', exerciseIds: [T, S], plans: {} } }, savedSchedules: [], activeScheduleId: null,
  exercises: [], meals: [], weights: [], recipes: [], water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, dayExtras: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null,
  workouts: [
    w('t-old', T, 20, { seconds: 1800, distanceM: 3200 }),
    w('t-7', T, 7, { seconds: 1800, distanceM: 5000, speedKmh: 10, inclinePct: 6 }),
    w('s-4', S, 4, { seconds: 1200, level: 8, floors: 95 }),
  ],
  exerciseNotes: [], exerciseSetups: {}, notifyPrefs: { restAlertAsked: true },
  activeSession: { startedAt: ago(0, 7).toISOString(), dayKey: dayKey(today), exerciseIds: [T, S], index: 0, restEndsAt: null, restSeconds: 90 },
  ...extra,
});

const browser = await chromium.launch();
const open = async (st, path = '/session') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: st, version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page };
};
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state);
const body = async (page) => western(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const press = (page, label) => page.getByLabel(label, { exact: true }).filter({ visible: true }).first().click();
const today0 = (st, id) => st.workouts.find((x) => x.exerciseId === id && new Date(x.at).toDateString() === today.toDateString());

// ── Treadmill ──
let { ctx, page } = await open(state('en'));
let b = await body(page);
check('last time reads the machine way, with Same again', b.includes('Last time · 7 days ago') && b.includes('30 min · 10 km/h · 6% incline · 5.0 km') && b.includes('Same again'));
check('settings open with last time’s numbers', b.includes('MACHINE SETTINGS') || /machine settings/i.test(b));
check('minutes, not seconds; distance from speed × time; estimate counts incline', b.includes('Minutes') && b.includes('from speed × time') && b.includes('5.0 km') && b.includes('≈ 481 kcal'), b.match(/Burned.{0,30}/)?.[0]);
check('no "Add my setup" for a treadmill', !b.includes('Add my setup'));
await page.screenshot({ path: `${SHOTS}/treadmill-en.png` });
await press(page, 'Increase Speed (km/h)');
await page.waitForTimeout(200);
b = await body(page);
check('faster: distance follows (10.5 km/h × 30 min = 5.3 km) and the change is noted', b.includes('5.3 km') && b.includes('+0.5 from last time'), b.match(/Distance.{0,40}/)?.[0]);
await page.getByText('Save session', { exact: true }).last().click();
await page.waitForTimeout(700);
let st = await store(page);
let set = today0(st, T)?.sets[0];
check('saved with the settings', set && set.speedKmh === 10.5 && set.inclinePct === 6 && set.seconds === 1800 && set.distanceM === 5250, JSON.stringify(set));
check('calories count the incline', (today0(st, T)?.caloriesBurned ?? 0) > 490, String(today0(st, T)?.caloriesBurned));
await ctx.close();

// ── Stair climber ──
({ ctx, page } = await open(state('en', { activeSession: { startedAt: ago(0, 7).toISOString(), dayKey: dayKey(today), exerciseIds: [T, S], index: 1, currentId: S, restEndsAt: null, restSeconds: 90 } })));
b = await body(page);
check('stair climber: level and floors from last time', b.includes('20 min · level 8 · 95 floors') && b.includes('Level') && b.includes('Floors (optional)'));
check('stair climber: no distance', !b.includes('from speed × time'));
await press(page, 'Increase Level');
await page.waitForTimeout(200);
b = await body(page);
check('+1 from last time', b.includes('+1 from last time'));
await page.screenshot({ path: `${SHOTS}/stairs-en.png` });
await page.getByText('Save session', { exact: true }).last().click();
await page.waitForTimeout(700);
st = await store(page);
set = today0(st, S)?.sets[0];
check('stair climber saved with level 9 and floors 95', set && set.level === 9 && set.floors === 95 && set.seconds === 1200, JSON.stringify(set));
await ctx.close();

// ── History ──
({ ctx, page } = await open(state('en', { activeSession: null }), `/exercise-detail?id=${encodeURIComponent(T)}&tab=history`));
b = await body(page);
check('History: sessions read the machine way; an older one stays as it was', b.includes('30 min · 10 km/h · 6% incline · 5.0 km') && b.includes('30 min · 3.2 km'), b.slice(0, 300));
await ctx.close();

// ── Arabic ──
({ ctx, page } = await open(state('ar')));
b = await body(page);
check('Arabic: last time, Same again, settings', b.includes('نفس الشيء') && b.includes('إعدادات الجهاز') && b.includes('30 دقيقة · 10 كم/س · ميل 6٪ · 5.0 كم') && b.includes('≈ 481 سعرة'), b.match(/المرة السابقة.{0,80}/)?.[0]);
await page.screenshot({ path: `${SHOTS}/treadmill-ar.png` });
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
