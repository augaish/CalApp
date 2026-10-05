// The approved redesign in the exported web app, English and Arabic:
// Overview leads with the workout card and keeps Next meal and the rest;
// Food has the calories card first, Log food / Plan on empty meals, the
// Recipes · Shopping · This week row, and "Added to Lunch · Undo" after a
// meal is logged elsewhere; the workout keeps Target and Best, then Last
// time with every set one tap away; Health's empty figure is small;
// Profile's calories have separators. Saves screenshots to $SHOTS.
// Needs the web build on :8099 (the API is not needed).
import { mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/redesign-shots';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const today = new Date();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ago = (n, h = 18) => { const x = new Date(today); x.setDate(x.getDate() - n); x.setHours(h, 0, 0, 0); return x; };
const BENCH = 'builtin:bench-press';
const OHP = 'builtin:shoulder-press';
const western = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٬/g, ',').replace(/٫/g, '.');

const state = (language, { session = false } = {}) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2525, proteinG: 120, carbsG: 322, fatG: 84 },
  schedule: { [today.getDay()]: { title: 'Push', exerciseIds: [BENCH, OHP], plans: { [BENCH]: [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }, { weightKg: 62.5, reps: 8 }, { weightKg: 62.5, reps: 8 }] } } },
  savedSchedules: [], activeScheduleId: null,
  exercises: [], weights: [{ at: ago(3, 8).toISOString(), kg: 70 }], recipes: [], water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {}, mealPlanSwaps: {}, shopping: null,
  // Lunch is planned from a bundled recipe, so Food offers "Log eaten" for it.
  mealPlanRecipes: { [dayKey(today)]: { lunch: { recipeId: 'calgym:chicken-kabsa', servings: 1 } } },
  meals: [{ id: 'm-snack', at: ago(0, 10).toISOString(), mealType: 'snack', items: [{ name: language === 'ar' ? 'تمر' : 'Dates', portion: '3', calories: 70, proteinG: 1, carbsG: 18, fatG: 0 }] }],
  workouts: [
    { id: 'old1', at: ago(6).toISOString(), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 60, reps: 10, done: true }, { weightKg: 62.5, reps: 8, done: true }, { weightKg: 62.5, reps: 8, done: true }, { weightKg: 65, reps: 6, done: true }] },
    { id: 'best', at: ago(13).toISOString(), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 70, reps: 8, done: true }] },
    ...(session ? [{ id: 'now', at: ago(0, 7).toISOString(), exerciseId: BENCH, exerciseName: 'Bench Press', type: 'weight_reps', caloriesBurned: 0, sets: [{ weightKg: 60, reps: 10, done: true }, { weightKg: 62.5, reps: 8, done: true }] }] : []),
  ],
  exerciseNotes: [{ id: 'note:old', exerciseId: BENCH, exerciseName: 'Bench Press', dayKey: dayKey(ago(6)), at: ago(6).toISOString(), text: 'Shoulder blades back. Pause at the chest.', updatedAt: ago(6).toISOString() }],
  notifyPrefs: { restAlertAsked: true },
  activeSession: session ? { startedAt: ago(0, 7).toISOString(), dayKey: dayKey(today), exerciseIds: [BENCH, OHP], index: 0, restEndsAt: new Date(Date.now() + 68000).toISOString(), restSeconds: 90 } : null,
});

const browser = await chromium.launch();
const open = async (lang, path, opts) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: state(lang, opts), version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page };
};
const body = async (page) => western(await page.evaluate(() => document.body.innerText));
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store')).state);

for (const lang of ['en', 'ar']) {
  const ar = lang === 'ar';
  const L = (en, a) => (ar ? a : en);
  // The Next meal card reads "Planned lunch" when the plan has one, as before the redesign.
  const NEXT_MEAL = L(/next meal|planned lunch/i, /الوجبة التالية|الغداء المخطط|غداء مخطط/);

  // ── Overview ──
  let { ctx, page } = await open(lang, '/');
  let b = await body(page);
  check(`${lang}: Overview leads with the workout card`, b.includes(L('Start workout', 'ابدأ التمرين')) && b.indexOf('Push') < b.search(NEXT_MEAL), b.replace(/\s+/g, ' ').slice(0, 400));
  check(`${lang}: Next meal, weight and water are still there`, NEXT_MEAL.test(b) && /70/.test(b) && b.includes(L('Water', 'الماء')));
  await page.screenshot({ path: `${SHOTS}/overview-${lang}.png`, fullPage: true });
  await ctx.close();

  // ── Food ──
  ({ ctx, page } = await open(lang, '/food'));
  b = await body(page);
  check(`${lang}: calories card shows 70 / 2,525`, /70/.test(b) && b.includes('2,525'), b.slice(0, 200));
  check(`${lang}: empty meals offer Log food and Plan`, b.includes(L('Log food', 'سجّل طعاماً')) && b.includes(L('Plan', 'خطّط')));
  check(`${lang}: Recipes · Shopping · This week row`, b.includes(L('This week', 'هذا الأسبوع')));
  if (ar) {
    const raw = await page.evaluate(() => document.body.innerText);
    check('ar: Food numbers in Arabic-Indic digits', raw.includes('٢٬٥٢٥') && !/2,525/.test(raw));
  }
  await page.screenshot({ path: `${SHOTS}/food-${lang}.png`, fullPage: true });
  const plan = page.getByRole('button', { name: L('Plan Breakfast', 'خطّط الفطور') });
  check(`${lang}: Plan has the full name for screen readers`, (await plan.count()) > 0);

  // Log the planned lunch through the portion screen, then come back.
  await page.getByText(L('Log eaten', 'سجّل أنني أكلتها'), { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText(L('Add to Lunch', 'أضف إلى الغداء'), { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText(L('Done', 'تم'), { exact: true }).last().click();
  await page.waitForTimeout(1500);
  check(`${lang}: Done returns to Food`, /\/food/.test(page.url()), page.url());
  b = await body(page);
  check(`${lang}: back on Food: "Added to Lunch" with Undo`, b.includes(L('Added to Lunch', 'أُضيف إلى الغداء')) && b.includes(L('Undo', 'تراجع')), b.slice(-300));
  await page.screenshot({ path: `${SHOTS}/food-added-${lang}.png` });
  let s = await store(page);
  const lunch = s.meals.filter((m) => m.mealType === 'lunch');
  check(`${lang}: lunch logged once`, lunch.length === 1);
  await page.getByText(L('Undo', 'تراجع'), { exact: true }).last().click();
  await page.waitForTimeout(500);
  s = await store(page);
  check(`${lang}: Undo removes it again`, s.meals.filter((m) => m.mealType === 'lunch').length === 0 && s.meals.length === 1);
  await ctx.close();

  // ── Workout ──
  ({ ctx, page } = await open(lang, '/session', { session: true }));
  b = await body(page);
  const iRest = b.indexOf(L('Rest', 'راحة'));
  const iTarget = b.search(L(/target/i, /الهدف/));
  const iBest = b.search(L(/best/i, /الأفضل/));
  const iLast = b.indexOf(L('Last time', 'المرة السابقة'));
  check(`${lang}: order is rest, Target, Best, Last time`, iRest > -1 && iRest < iTarget && iTarget < iBest && iBest < iLast, `${iRest} ${iTarget} ${iBest} ${iLast}`);
  check(`${lang}: Target 62.5 × 8 (set 3), Best 70 × 8`, /62\.5 \S+ × 8/.test(b) && /70 \S+ × 8/.test(b));
  check(`${lang}: all four sets from last time are buttons`, (await page.getByRole('button', { name: new RegExp(L('Last time', 'المرة السابقة')) }).count()) === 4);
  const done = await page.getByRole('button', { name: new RegExp(L('Logged', 'سُجّلت')) }).count();
  check(`${lang}: the two sets done today are marked`, done === 2, String(done));
  // Tap last time's set 4 (65 × 6): the boxes take it, nothing is logged.
  const before = await store(page);
  await page.getByRole('button', { name: new RegExp(`${L('Last time', 'المرة السابقة')} 4`) }).click();
  await page.waitForTimeout(300);
  const boxes = (await page.$$eval('input', (els) => els.map((e) => e.value))).map(western);
  check(`${lang}: tapping set 4 fills 65 and 6`, boxes.includes('65') && boxes.includes('6'), boxes.join(','));
  check(`${lang}: …and logs nothing by itself`, (await store(page)).workouts.length === before.workouts.length);
  if (ar) {
    const raw = await page.evaluate(() => document.body.innerText);
    check('ar: set numbers and the strip count in Arabic-Indic digits', !/[0-9]/.test(raw.replace(/Push/g, '')), raw.match(/.{0,20}[0-9].{0,20}/)?.[0]);
  }
  check(`${lang}: Finish workout still there`, b.includes(L('Finish workout', 'إنهاء التمرين')));
  await page.screenshot({ path: `${SHOTS}/workout-${lang}.png`, fullPage: true });
  await ctx.close();

  // ── Health and Profile ──
  ({ ctx, page } = await open(lang, '/health'));
  const fig = await page.evaluate(() => Math.max(...[...document.querySelectorAll('svg')].map((e) => e.getBoundingClientRect().height)));
  check(`${lang}: no per-limb scan → the figure is small`, fig > 0 && fig < 75, String(fig));
  await page.screenshot({ path: `${SHOTS}/health-${lang}.png` });
  await ctx.close();
  ({ ctx, page } = await open(lang, '/profile'));
  b = await body(page);
  check(`${lang}: Profile shows 2,525 kcal`, b.includes('2,525'));
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
