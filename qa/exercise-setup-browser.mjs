// "My setup" in the exported web app: a machine with no setup shows a quiet
// "Add my setup"; saving one during a rest leaves the rest and the sets alone
// and shows it under the exercise name; a cable station offers the handle as
// choices; a dumbbell exercise gets only the lower link; History shows each
// workout's setup and "Setup changed: Seat 5 → 4"; Arabic works.
// Needs the web build on :8099 (the API is not needed).
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/setup-shots';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const western = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const today = new Date();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ago = (n, h = 18) => { const x = new Date(today); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x; };
const LEG = 'builtin:leg-press';
const LAT = 'builtin:lat-pulldown';
const CURL = 'builtin:dumbbell-curl';
const legWorkout = (id, n, kg) => ({ id, at: ago(n).toISOString(), exerciseId: LEG, exerciseName: 'Leg Press', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: kg, reps: 10, done: true }] });

const state = (language, extra = {}) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: { [today.getDay()]: { title: 'Leg day', exerciseIds: [LEG, LAT, CURL], plans: {} } }, savedSchedules: [], activeScheduleId: null,
  exercises: [], meals: [], weights: [], recipes: [], water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, dayExtras: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null,
  workouts: [legWorkout('w14', 14, 140), legWorkout('w7', 7, 150), legWorkout('w2', 2, 150)],
  exerciseNotes: [], exerciseSetups: {}, notifyPrefs: { restAlertAsked: true },
  activeSession: { startedAt: ago(0, 7).toISOString(), dayKey: dayKey(today), exerciseIds: [LEG, LAT, CURL], index: 0, restEndsAt: new Date(Date.now() + 120000).toISOString(), restSeconds: 120 },
  ...extra,
});
// Seat 5 from three weeks ago, Seat 4 from three days ago.
const VERSIONS = { [LEG]: [
  { at: ago(21).toISOString(), fields: [{ key: 'seat', value: '5' }, { key: 'backPad', value: '2' }] },
  { at: ago(3).toISOString(), fields: [{ key: 'seat', value: '4' }, { key: 'backPad', value: '2' }, { key: 'feet', value: 'high, wide' }] },
] };

const browser = await chromium.launch();
const open = async (st, path = '/session') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: st, version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page };
};
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state);
const body = async (page) => western(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const tap = (page, name) => page.getByText(name, { exact: true }).filter({ visible: true }).first().click();
const press = async (page, label, n = 1) => { for (let i = 0; i < n; i++) await page.getByLabel(label, { exact: true }).click(); };

// ── 1. Leg press, nothing saved yet, rest running ──
let { ctx, page } = await open(state('en'));
let b = await body(page);
check('a machine with no setup shows "Add my setup" and its hint', b.includes('Add my setup') && b.includes('Seat, pads, handle'));
await page.screenshot({ path: `${SHOTS}/add-en.png` });
const before = await store(page);
await tap(page, 'Add my setup');
await page.waitForTimeout(500);
b = await body(page);
check('the sheet starts with Seat and Back pad', b.includes('stays until you change it') && b.includes('Seat') && b.includes('Back pad'));
check('it offers more settings for a machine', b.includes('+ Start position') && b.includes('+ Feet') && b.includes('+ Other…'));
await press(page, 'Seat +', 4);
await press(page, 'Back pad +', 3);
await press(page, 'Back pad −');
await tap(page, '+ Feet');
await page.getByLabel('Feet', { exact: true }).fill('high, wide');
await page.screenshot({ path: `${SHOTS}/sheet-en.png` });
await tap(page, 'Save setup');
await page.waitForTimeout(500);
b = await body(page);
check('the card shows the setup', /MY SETUP/i.test(b) && b.includes('Seat 4') && b.includes('Back pad 2') && b.includes('Feet high, wide') && b.includes('Saved today'), b.slice(0, 300));
let after = await store(page);
check('one version saved', after.exerciseSetups[LEG]?.length === 1 && after.exerciseSetups[LEG][0].fields.map((f) => `${f.key}=${f.value}`).join(',') === 'seat=4,backPad=2,feet=high, wide', JSON.stringify(after.exerciseSetups));
check('the rest kept running and no set was logged', after.activeSession.restEndsAt === before.activeSession.restEndsAt && after.workouts.length === before.workouts.length);
await page.screenshot({ path: `${SHOTS}/card-en.png` });

// Edit: a second change today replaces today's version.
await page.getByLabel(/^My setup: /).click();
await page.waitForTimeout(400);
await press(page, 'Seat −');
await tap(page, 'Save setup');
await page.waitForTimeout(400);
after = await store(page);
check('a second change today stays one version', after.exerciseSetups[LEG].length === 1 && after.exerciseSetups[LEG][0].fields[0].value === '3');

// ── 2. Lat pulldown: the handle is a choice ──
await tap(page, 'Lat Pulldown');
await page.waitForTimeout(500);
await tap(page, 'Add my setup');
await page.waitForTimeout(400);
b = await body(page);
check('a cable station starts with Pulley height and Handle', b.includes('Pulley height') && b.includes('Handle') && b.includes('V-bar') && b.includes('Rope'));
await press(page, 'Pulley height +', 7);
await tap(page, 'V-bar');
await tap(page, 'Save setup');
await page.waitForTimeout(400);
b = await body(page);
check('the card shows Pulley height 7 · Handle V-bar', b.includes('Pulley height 7') && b.includes('Handle V-bar'));

// ── 3. Dumbbell curl: nothing up top, a link lower down ──
await tap(page, 'Dumbbell Curl');
await page.waitForTimeout(500);
b = await body(page);
check('dumbbell curls: no hint up top, just the lower link', !b.includes('Seat, pads, handle') && (await page.getByText('Add my setup', { exact: true }).filter({ visible: true }).count()) === 1);
await ctx.close();

// ── 4. A saved setup, and History ──
({ ctx, page } = await open(state('en', { exerciseSetups: VERSIONS })));
b = await body(page);
const since = ago(3).toLocaleDateString('en', { month: 'short', day: 'numeric' });
check(`the card says "Same since ${since}"`, b.includes(`Same since ${since}`) && b.includes('Seat 4'));
await ctx.close();
({ ctx, page } = await open(state('en', { exerciseSetups: VERSIONS, activeSession: null }), `/exercise-detail?id=${encodeURIComponent(LEG)}&tab=history`));
b = await body(page);
check('History: each workout shows its setup', b.includes('Seat 4 · Back pad 2 · Feet high, wide') && (b.match(/Seat 5 · Back pad 2/g) ?? []).length === 2, b.slice(0, 400));
check('History: "Setup changed: Seat 5 → 4, Feet high, wide added" once', (b.match(/Setup changed:/g) ?? []).length === 1 && b.includes('Setup changed: Seat 5 → 4, Feet high, wide added'), b.match(/Setup changed:.{0,60}/)?.[0]);
await page.screenshot({ path: `${SHOTS}/history-en.png`, fullPage: true });
await ctx.close();

// ── 5. Arabic ──
({ ctx, page } = await open(state('ar', { exerciseSetups: VERSIONS })));
b = await body(page);
const raw = await page.evaluate(() => document.body.innerText);
check('Arabic: إعداداتي with المقعد ٤ and مسند الظهر ٢', b.includes('إعداداتي') && b.includes('المقعد 4') && b.includes('مسند الظهر 2') && raw.includes('٤'), b.slice(0, 300));
await page.screenshot({ path: `${SHOTS}/card-ar.png` });
await page.getByLabel(/^إعداداتي: /).click();
await page.waitForTimeout(400);
b = await body(page);
check('Arabic sheet: title, settings and Save', b.includes('تبقى كما هي حتى تغيّرها') && b.includes('القدمان') && b.includes('احفظ الإعدادات'));
await page.screenshot({ path: `${SHOTS}/sheet-ar.png` });
await ctx.close();
({ ctx, page } = await open(state('ar', { exerciseSetups: VERSIONS, activeSession: null }), `/exercise-detail?id=${encodeURIComponent(LEG)}&tab=history`));
b = await body(page);
check('Arabic History: تغيّرت الإعدادات: المقعد 5 → 4', b.includes('تغيّرت الإعدادات: المقعد 5 → 4'), b.match(/تغيّرت.{0,60}/)?.[0]);
await page.screenshot({ path: `${SHOTS}/history-ar.png`, fullPage: true });
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
