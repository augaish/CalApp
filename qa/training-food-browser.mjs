// In the exported web app:
// - every set opens with the highlighted "Last time" chip's numbers, and a
//   number you change is what gets logged;
// - switching exercise from the strip never stops a running rest;
// - swiping a Food row and tapping Delete removes it at once, with Undo.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:8099';
const today = new Date();
const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const BENCH = 'builtin:bench-press';
const OHP = 'builtin:shoulder-press';
const base = (over = {}) => ({
  language: 'en', account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  // The plan asks for lighter sets; last time's chips must still win.
  schedule: { [today.getDay()]: { title: 'Push', exerciseIds: [BENCH, OHP], plans: { [BENCH]: [{ weightKg: 20, reps: 12 }, { weightKg: 20, reps: 12 }, { weightKg: 18, reps: 12 }] } } },
  savedSchedules: [], activeScheduleId: null,
  workouts: [{ id: 'old', at: at(7), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 0,
    sets: [{ weightKg: 24, reps: 12, done: true }, { weightKg: 28, reps: 7, done: true }, { weightKg: 28, reps: 6, done: true }] }],
  exercises: [], meals: [], weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [],
  skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  activeSession: { startedAt: at(0, 7), dayKey, exerciseIds: [BENCH, OHP], index: 0, restEndsAt: null, restSeconds: 90 },
  ...over,
});
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
async function open(state, path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state, version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page };
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store') || '{}').state);
const boxes = (page) => page.$$eval('input', (els) => els.map((e) => e.value));
const complete = async (page, label) => { await page.getByText(label, { exact: true }).click(); await page.waitForTimeout(700); };

console.log('=== Sets open with the highlighted Last time chip ===');
let { ctx, page } = await open(base(), '/session');
let v = await boxes(page);
check('set 1 opens at chip 1: 24 kg × 12 (not the plan\'s 20 × 12)', v[0] === '24' && v[1] === '12', v.join(','));
await complete(page, 'Complete set 1 of 3');
v = await boxes(page);
check('set 2 opens at chip 2: 28 kg × 7', v[0] === '28' && v[1] === '7', v.join(','));
// Change set 2 by hand: what you type is what gets logged, and it does not leak into set 3.
await page.locator('input').nth(1).fill('9');
await page.waitForTimeout(200);
await complete(page, 'Complete set 2 of 3');
v = await boxes(page);
check('set 3 opens at chip 3: 28 kg × 6', v[0] === '28' && v[1] === '6', v.join(','));
let st = await store(page);
const logged = st.workouts.find((w) => w.exerciseId === BENCH && w.id !== 'old');
check('the edited set 2 was logged as typed (28 × 9)', logged?.sets?.[1]?.weightKg === 28 && logged?.sets?.[1]?.reps === 9, JSON.stringify(logged?.sets));

console.log('=== Switching exercise keeps the rest running ===');
const restBefore = st.activeSession.restEndsAt;
check('rest is running after the set', !!restBefore);
await page.locator('[role="button"]', { hasText: /Shoulder/ }).first().click();
await page.waitForTimeout(700);
st = await store(page);
check('now on the shoulder press', st.activeSession.currentId === OHP, st.activeSession.currentId);
check('rest end time unchanged', st.activeSession.restEndsAt === restBefore, `${restBefore} → ${st.activeSession.restEndsAt}`);
check('rest card still on screen', /Skip rest/.test(await page.textContent('body')));
check('lock-screen "Next" names the shoulder press', /Shoulder/.test(st.activeSession.restNext ?? ''), st.activeSession.restNext);
await page.getByText('Skip rest', { exact: true }).click(); await page.waitForTimeout(400);
check('Skip rest still stops it', !(await store(page)).activeSession.restEndsAt);
await ctx.close();

console.log('=== Swipe a Food row, Delete, Undo ===');
const meals = [
  { id: 'm-wrap', at: at(0, 13), mealType: 'lunch', items: [{ name: 'Chicken wrap', calories: 520, proteinG: 35, carbsG: 50, fatG: 18, portion: '1 wrap' }] },
  { id: 'm-plate', at: at(0, 20), mealType: 'dinner', items: [
    { name: 'Shawarma plate', calories: 563, proteinG: 40, carbsG: 45, fatG: 22, portion: '1 plate' },
    { name: 'Garlic sauce', calories: 79, proteinG: 0, carbsG: 2, fatG: 8, portion: '1 tbsp' },
  ] },
];
({ ctx, page } = await open(base({ meals, activeSession: null }), '/food'));
// A finger, not a mouse: the swipe is a touch gesture (a mouse drag is a tap).
const swipe = async (name) => {
  const row = page.getByText(name, { exact: true }).first();
  await row.scrollIntoViewIfNeeded();
  const b = await row.boundingBox();
  const y = b.y + b.height / 2;
  const cdp = await ctx.newCDPSession(page);
  const tp = (x) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(340) });
  for (let x = 330; x >= 150; x -= 10) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  check(`swiping ${name} stays on Food (no tap)`, page.url().endsWith('/food'), page.url());
};
await swipe('Garlic sauce');
const del = page.getByRole('button', { name: 'Delete · Garlic sauce' });
check('swiping shows a Delete button', !!(await del.boundingBox().catch(() => null)));
await del.click(); await page.waitForTimeout(500);
st = await store(page);
let plate = st.meals.find((m) => m.id === 'm-plate');
check('only that food is deleted; the plate stays', plate?.items.length === 1 && plate.items[0].name === 'Shawarma plate', JSON.stringify(plate?.items.map((i) => i.name)));
check('no "Are you sure?" question, and an Undo bar', /Deleted: Garlic sauce/.test(await page.textContent('body')));
await page.getByText('Undo', { exact: true }).last().click(); await page.waitForTimeout(400);
plate = (await store(page)).meals.find((m) => m.id === 'm-plate');
check('Undo brings it back', plate?.items.length === 2, JSON.stringify(plate?.items.map((i) => i.name)));

await swipe('Chicken wrap');
await page.getByRole('button', { name: 'Delete · Chicken wrap' }).click(); await page.waitForTimeout(500);
st = await store(page);
check('a one-food meal is deleted whole', !st.meals.some((m) => m.id === 'm-wrap'));
await page.getByText('Undo', { exact: true }).last().click(); await page.waitForTimeout(400);
st = await store(page);
check('Undo puts the meal back in its place', st.meals.map((m) => m.id).join() === 'm-wrap,m-plate', st.meals.map((m) => m.id).join());
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
