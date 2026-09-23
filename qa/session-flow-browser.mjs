// The workout's set counting and auto-advance, and the water sheet's
// buttons, in the exported web app (English and Arabic).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/session-flow';
fs.mkdirSync(OUT, { recursive: true });
const today = new Date();
const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const base = (lang = 'en', over = {}) => ({
  language: lang, account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: { [today.getDay()]: { title: 'Push', exerciseIds: ['builtin:bench-press', 'builtin:shoulder-press'] } }, savedSchedules: [], activeScheduleId: null,
  workouts: [], exercises: [], meals: [], weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [],
  skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  activeSession: { startedAt: at(0, 7), dayKey, exerciseIds: ['builtin:bench-press', 'builtin:shoulder-press'], index: 0, restEndsAt: null, restSeconds: 90 },
  ...over,
});
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const browser = await chromium.launch();
async function open(state, path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state, version: 13 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page };
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store') || '{}').state);
const body = async (page) => squash(await page.textContent('body'));
const realErrors = (page) => page.errors.filter((e) => !/Notifications\./.test(e));

console.log('=== No plan: three sets, the button counts ===');
let { ctx, page } = await open(base(), '/session');
let b = await body(page);
check('the button starts at "Complete set 1 of 3"', /Complete set 1 of 3/.test(b));
check('  and the line under the name says Set 1 of 3', /Set 1 of 3/.test(b));
check('the strip counts against three', /0\/3|Bench Press/.test(b));
await page.getByText('Complete set 1 of 3', { exact: true }).click(); await page.waitForTimeout(600);
b = await body(page);
check('after set 1 it says "Complete set 2 of 3"', /Complete set 2 of 3/.test(b));
let st = await store(page);
check('  rest is running', !!st.activeSession.restEndsAt);
check('  with the next step named for the lock-screen alert', /Next: set 2 of 3 · Barbell Bench Press/.test(st.activeSession.restNext ?? ''), st.activeSession.restNext);
await page.getByText('Complete set 2 of 3', { exact: true }).click(); await page.waitForTimeout(600);
b = await body(page);
check('the third is "Complete last set (3 of 3)"', /Complete last set \(3 of 3\)/.test(b));
await page.screenshot({ path: `${OUT}/last-set-button.png` });
await page.getByText('Complete last set (3 of 3)', { exact: true }).click(); await page.waitForTimeout(800);
st = await store(page); b = await body(page);
check('the last set moves to the next exercise', st.activeSession.currentId === 'builtin:shoulder-press', st.activeSession.currentId);
check('  the rest keeps running through the move', !!st.activeSession.restEndsAt);
check('  and the alert will name the next exercise', /Next: .*Shoulder Press · set 1 of 3/i.test(st.activeSession.restNext ?? ''), st.activeSession.restNext);
check('a banner says what happened, with Back', /Barbell Bench Press done → .*Shoulder Press/i.test(b) && /Back/.test(b));
check('three sets were logged, not more', st.workouts[0]?.sets.filter((s) => s.done).length === 3);
await page.screenshot({ path: `${OUT}/moved-on.png` });

console.log('\n=== Back, and an extra set stays put ===');
await page.getByText('Back', { exact: true }).last().click(); await page.waitForTimeout(600);
st = await store(page); b = await body(page);
check('Back returns to bench press', st.activeSession.currentId === 'builtin:bench-press');
check('  where the button offers an extra set', /Add extra set \(4\)/.test(b));
check('  and the line says all 3 sets are done', /All 3 sets done/.test(b));
await page.getByText('Add extra set (4)', { exact: true }).click(); await page.waitForTimeout(600);
st = await store(page);
check('an extra set does not move on', st.activeSession.currentId === 'builtin:bench-press' && st.workouts[0].sets.length === 4);

console.log('\n=== The last exercise finishes the workout ===');
await page.getByText(/Shoulder Press/).first().click(); await page.waitForTimeout(600);
const skip = page.getByText('Skip rest'); if (await skip.count()) await skip.first().click();
for (const label of ['Complete set 1 of 3', 'Complete set 2 of 3', 'Complete last set (3 of 3)']) {
  await page.getByText(label, { exact: true }).click(); await page.waitForTimeout(600);
}
b = await body(page);
check('with every exercise done, the save-workout summary opens', /Save workout/.test(b), b.slice(0, 120));
st = await store(page);
check('  and no rest is left running', !st.activeSession?.restEndsAt);
check('no page errors', realErrors(page).length === 0, realErrors(page).join(' | '));
await ctx.close();

console.log('\n=== A plan of five is followed ===');
({ ctx, page } = await open(base('en', { schedule: { [today.getDay()]: { title: 'Push', exerciseIds: ['builtin:bench-press', 'builtin:shoulder-press'], plans: { 'builtin:bench-press': Array.from({ length: 5 }, () => ({ weightKg: 60, reps: 8 })) } } } }), '/session'));
b = await body(page);
check('a five-set plan counts to five', /Complete set 1 of 5/.test(b) && /Set 1 of 5/.test(b));
await ctx.close();

console.log('\n=== Arabic ===');
({ ctx, page } = await open(base('ar'), '/session'));
b = await body(page);
check('ar: "إتمام المجموعة 1 من 3"', /إتمام المجموعة 1 من 3/.test(b));
await page.getByText('إتمام المجموعة 1 من 3', { exact: true }).click(); await page.waitForTimeout(500);
await page.getByText('إتمام المجموعة 2 من 3', { exact: true }).click(); await page.waitForTimeout(500);
b = await body(page);
check('ar: the last set says so', /إتمام المجموعة الأخيرة \(3 من 3\)/.test(b));
await page.getByText('إتمام المجموعة الأخيرة (3 من 3)', { exact: true }).click(); await page.waitForTimeout(800);
b = await body(page);
check('ar: moved on, with the banner', /انتهى .* ← /.test(b) && (await store(page)).activeSession.currentId === 'builtin:shoulder-press');
await page.screenshot({ path: `${OUT}/moved-on-ar.png` });
check('ar: no page errors', realErrors(page).length === 0, realErrors(page).join(' | '));
await ctx.close();

console.log('\n=== Water buttons ===');
({ ctx, page } = await open(base('en', { activeSession: null }), '/water'));
b = await body(page);
check('a new person gets 250 / 330 / 500', /250\s*ml\s*330\s*ml\s*500\s*ml/.test(b), b.match(/\d+ ?ml.{0,40}/)?.[0]);
await page.screenshot({ path: `${OUT}/water-default.png` });
await page.getByText('330', { exact: true }).click(); await page.waitForTimeout(600);
st = await store(page);
check('tapping 330 logs 330 ml', st.water[0]?.ml === 330);
await ctx.close();
const habit = [0, 1, 2, 3, 4, 5].map((d) => ({ at: at(d, 9), ml: 600 }));
({ ctx, page } = await open(base('en', { activeSession: null, water: habit }), '/water'));
b = await body(page);
check('600 ml logged most days for a week becomes a button', /330\s*ml\s*500\s*ml\s*600\s*ml/.test(b), b.match(/\d+ ?ml.{0,40}/)?.[0]);
await page.screenshot({ path: `${OUT}/water-learned.png` });
check('water: no page errors', realErrors(page).length === 0, realErrors(page).join(' | '));
await ctx.close();

await browser.close();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
