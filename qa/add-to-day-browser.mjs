// Adding an exercise to the day's list never logs a set: Training → Add
// exercise opens the library in "add to today" mode, tapping adds and tapping
// again takes it off, Done goes back, the list shows them, nothing is logged,
// ✕ takes an added one off, and the Overview card can start the workout with
// them. English and Arabic. Needs the web build on :8099.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const today = new Date();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const state = (lang) => ({
  language: lang, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2200, proteinG: 120, carbsG: 250, fatG: 70 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, exercises: [], meals: [], weights: [], recipes: [], water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {},
  whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, workouts: [], exerciseNotes: [], notifyPrefs: { restAlertAsked: true },
});
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state);
const body = (page) => page.evaluate(() => document.body.innerText);

const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  const L = (en, a) => (lang === 'ar' ? a : en);
  const SQUAT = L('Barbell Squat', 'سكوات بار');
  const PLANK = L('Plank', 'البلانك');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: state(lang), version: 16 });
  const page = await ctx.newPage();
  // The screen under the library lists the same names once added: click the visible one.
  const tap = (name) => page.getByText(name, { exact: true }).filter({ visible: true }).first().click();
  await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.getByText(L('Add exercise', 'إضافة تمرين'), { exact: true }).first().click();
  await page.waitForTimeout(1200);
  let b = await body(page);
  check(`${lang}: the library says nothing is logged`, b.includes(L("Tap to add to today's list", 'اضغط لإضافة التمرين إلى قائمة اليوم')), page.url());
  await tap(SQUAT);
  await page.waitForTimeout(300);
  await tap(PLANK);
  await page.waitForTimeout(300);
  check(`${lang}: tapping keeps you in the library (no log screen)`, /exercise-library/.test(page.url()), page.url());
  let s = await store(page);
  check(`${lang}: two added to today, nothing logged`, (s.dayExtras?.[dayKey(today)] ?? []).length === 2 && s.workouts.length === 0, JSON.stringify(s.dayExtras));
  await tap(PLANK);
  await page.waitForTimeout(300);
  s = await store(page);
  check(`${lang}: tapping again takes it off`, JSON.stringify(s.dayExtras?.[dayKey(today)]) === JSON.stringify(['builtin:squat']), JSON.stringify(s.dayExtras));
  await tap(PLANK);
  await page.waitForTimeout(300);
  check(`${lang}: Done shows the count`, (await body(page)).includes(L('Done (2 in the list)', 'تم (٢ في القائمة)')));
  await page.getByText(L('Done (2 in the list)', 'تم (٢ في القائمة)'), { exact: true }).click();
  await page.waitForTimeout(1200);

  b = await body(page);
  check(`${lang}: Training lists both`, b.includes(SQUAT) && b.includes(PLANK), b.slice(0, 300));
  s = await store(page);
  check(`${lang}: still nothing logged`, s.workouts.length === 0);

  // ✕ on Plank takes it off the list.
  await page.getByRole('button', { name: L('Delete', 'حذف'), exact: true }).last().click();
  await page.waitForTimeout(500);
  s = await store(page);
  check(`${lang}: ✕ takes an added exercise off`, JSON.stringify(s.dayExtras?.[dayKey(today)]) === JSON.stringify(['builtin:squat']), JSON.stringify(s.dayExtras));

  // Overview's card offers to start, and the workout has the added exercise.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  b = await body(page);
  check(`${lang}: Overview offers Start workout`, b.includes(L('Start workout', 'ابدأ التمرين')), b.slice(0, 250));
  await page.getByText(L('Start workout', 'ابدأ التمرين'), { exact: true }).first().click();
  await page.waitForTimeout(1500);
  b = await body(page);
  check(`${lang}: the workout opens on the added exercise`, /\/session/.test(page.url()) && b.includes(SQUAT), page.url());
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
