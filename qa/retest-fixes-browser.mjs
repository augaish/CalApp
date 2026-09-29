// The Android retest's findings, as journeys in the exported web app (the
// screens are shared, so the same code runs on iPhone):
//  1. Swap → pick another recipe → a replacement preview with Apply, not Log eaten.
//  2. Log eaten on a planned ½ serving opens at ½ serving and its calories.
//  3. Protein left is an upper bound when some protein is unknown.
//  4. Arabic: portions in Arabic, set counts in the right form, header titles
//     clear of the buttons.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/retest-fixes';
fs.mkdirSync(OUT, { recursive: true });

const today = new Date();
const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const at = (daysAgo, h = 12) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const ing = (name, amount, kcal, extra = {}) => ({ name, key: name.toLowerCase().replace(/\s+/g, '_'), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 40, carbsG: 60, fatG: 10, aisle: 'pantry', ...extra });
// 2 servings × 1,327 kcal: half a serving is 664 kcal, as in the report.
const recipe = (id, name, over = {}) => ({ id, name, servings: 2, createdAt: at(1), language: 'en', source: 'custom', reviewStatus: 'ready', ingredients: [ing('Rice', 400, 1400), ing('Chicken', 600, 1254)], steps: ['Cook.'], ...over });
const base = (lang = 'en') => ({
  language: lang, account: { name: 'T', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true,
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 75, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], units: 'metric', focusAreas: ['food', 'training'],
  weights: [], recipes: [], mealPlanSwaps: {}, mealPlanRecipes: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
});
const planned = (lang = 'en') => ({
  ...base(lang),
  // The stew is 414 kcal a serving, so swapping ½ kabsa (664) for one serving is −250.
  recipes: [recipe('ra', 'Chicken kabsa'), recipe('rb', 'Lentil stew', { ingredients: [ing('Lentils', 300, 600), ing('Onion', 200, 228)] })],
  mealPlanRecipes: { [key(today)]: { lunch: { recipeId: 'ra', servings: 0.5 } } },
});

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const browser = await chromium.launch();
async function open(state, path, lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state, version: 15 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store') || '{}').state);
const body = async (page) => squash(await page.textContent('body'));
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ═══ 1. Swap journey ═══
console.log('=== 1. Swap → replacement preview → Apply ===');
{
  const { ctx, page } = await open(planned(), '/food?tab=plan');
  await page.getByText('Swap', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  check('Swap opens the recipe picker for this slot', /\/recipes\?/.test(page.url()) && /slot=lunch/.test(page.url()), page.url());
  await page.getByText('Lentil stew', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  let b = await body(page); await shot(page, '1-recipe-in-picker');
  // The screen's own footer (screens underneath stay in the page on the web).
  check('the picked recipe offers "Use for Lunch", not Log eaten', /intent=plan/.test(page.url()) && /Use for Lunch\s*$/.test(b) && !/Log eaten\s*$/.test(b), b.slice(-60));
  await page.getByText('Use for Lunch', { exact: true }).last().click();
  await page.waitForTimeout(1200);
  b = await body(page); await shot(page, '1-replacement-preview');
  check('a replacement preview: before (kabsa) and after (stew), with Apply', /plan-meal/.test(page.url()) && /Chicken kabsa/.test(b) && /Lentil stew/.test(b) && /Apply/.test(b), page.url());
  check('the replacement keeps the planned ½ serving', /½ serving/.test(b));
  await page.getByText('1', { exact: true }).last().click();
  await page.waitForTimeout(400);
  b = await body(page);
  check('one 414 kcal serving instead of ½ kabsa (664) previews −250 kcal', /−250 kcal/.test(b), b.match(/.{0,30}250.{0,10}/)?.[0]);
  await page.getByText('½', { exact: true }).last().click();
  await page.waitForTimeout(300);
  await page.getByText(/^Apply/).last().click();
  await page.waitForTimeout(1500);
  const st = await store(page);
  const entry = st.mealPlanRecipes[key(today)]?.lunch;
  check('Apply puts the stew on today\'s lunch at ½ serving', entry?.recipeId === 'rb' && entry?.servings === 0.5, JSON.stringify(entry));
  check('…and returns to the plan, not the picker', /\/food/.test(page.url()) && !/recipes|recipe\?|plan-meal/.test(page.url()), page.url());
  check('no diary entry was written by the swap', (st.meals ?? []).length === 0);
  check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}
{
  // View recipe on a planned meal is still about eating it.
  const { ctx, page } = await open(planned(), `/recipe?id=ra&day=${key(today)}&slot=lunch`);
  check('View recipe on a planned meal still offers Log eaten', /Log eaten/.test(await body(page)));
  await ctx.close();
}

// ═══ 2. Planned portion carried into logging ═══
console.log('\n=== 2. Log eaten keeps the planned portion ===');
{
  const { ctx, page } = await open(planned(), '/food?tab=plan');
  await page.getByText('Log eaten', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  const b = await body(page); await shot(page, '2-log-planned-half');
  check('opens at ½ serving', /½ serving/.test(b), b.match(/I ate.{0,60}/)?.[0]);
  check('with the planned calories (664), not a full serving (1,327)', /664/.test(b) && !/1,327 kcal/.test(b), b.match(/\d[\d,]* kcal/)?.[0]);
  check('says it matches the plan', /As planned/.test(b));
  await page.getByText(/^Add to Lunch/).last().click();
  await page.waitForTimeout(800);
  const st = await store(page);
  check('the diary entry is ½ serving', st.meals[0]?.items[0]?.recipeServings === 0.5 && st.meals[0]?.items[0]?.calories === 664, JSON.stringify(st.meals[0]?.items[0] ?? {}).slice(0, 120));
  await ctx.close();
}
{
  const { ctx, page } = await open(base(), '/log-portion?recipeId=ra');
  await page.close(); await ctx.close();
  const again = await open({ ...planned(), mealPlanRecipes: {} }, '/log-portion?recipeId=ra');
  check('logging from the library still starts at 1 serving', /1 serving/.test(await body(again.page)));
  await again.ctx.close();
}

// ═══ 3. Protein left as an upper bound ═══
console.log('\n=== 3. Protein left with unknown values ===');
{
  const meals = [
    { id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Eggs', calories: 300, proteinG: 24, carbsG: 2, fatG: 20, portion: '3' }] },
    { id: 'm2', at: at(0, 12), mealType: 'lunch', items: [{ name: 'Mystery wrap', calories: 500, proteinG: 70, carbsG: 50, fatG: 10, portion: '1', nutritionIncomplete: true, incompleteNutrients: ['proteinG'] }] },
  ];
  let { ctx, page } = await open({ ...base(), meals }, '/');
  let b = await body(page); await shot(page, '3-protein-upper-bound');
  check('Overview: "≤56 g" and "at most" when some protein is unknown', /≤56 g/.test(b) && /protein left at most/.test(b), b.match(/.{0,20}protein left.{0,40}/)?.[0]);
  await ctx.close();
  ({ ctx, page } = await open({ ...base(), meals: [meals[0]] }, '/'));
  b = await body(page);
  check('all protein known: a plain "126 g" left', /126 g/.test(b) && /protein left today/.test(b) && !/≤/.test(b.match(/.{0,10}126 g/)?.[0] ?? ''));
  await ctx.close();
}

{
  const meals = [{ id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Chicken', calories: 900, proteinG: 160, carbsG: 0, fatG: 20, portion: '1' }] }];
  const { ctx, page } = await open({ ...base(), meals }, '/');
  const b = await body(page);
  check('over the target: "protein goal reached", not "0 g left"', /protein goal reached/.test(b) && /160 g/.test(b));
  await ctx.close();
}

// ═══ 4. Arabic ═══
console.log('\n=== 4. Arabic ===');
{
  // Logged in English, then the app switched to Arabic.
  const meals = [{ id: 'm1', at: at(0, 12), mealType: 'lunch', items: [{ name: 'Chicken kabsa', calories: 664, proteinG: 50, carbsG: 30, fatG: 5, portion: '½ serving', recipeId: 'ra', recipeServings: 0.5 }] }];
  const { ctx, page } = await open({ ...planned('ar'), meals }, '/food', 'ar');
  const b = await body(page); await shot(page, '4-ar-portion');
  check('ar: the diary portion reads "½ حصة", not "½ serving"', /½ حصة/.test(b) && !/serving/.test(b), b.match(/.{0,20}½.{0,20}/)?.[0]);
  await ctx.close();
}
{
  const workouts = [{ id: 'w1', at: at(1, 18), exerciseId: 'builtin:bench-press', exerciseName: 'Bench Press', type: 'weight_reps', sets: [{ weightKg: 60, reps: 8, done: true }] }];
  const { ctx, page } = await open({ ...base('ar'), workouts }, '/workout-history', 'ar');
  const b = await body(page); await shot(page, '4-ar-one-set');
  check('ar: one set reads "مجموعة واحدة", not "1 مجموعات"', /مجموعة واحدة/.test(b) && !/1 مجموعات/.test(b), b.match(/.{0,30}مجموع.{0,20}/)?.[0]);
  await ctx.close();
}
{
  const { ctx, page } = await open(planned('ar'), '/recipe?id=ra', 'ar');
  await shot(page, '4-ar-header');
  const boxes = await page.evaluate(() => {
    const back = document.querySelector('[role="button"]');
    const title = [...document.querySelectorAll('div,span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'وصفة');
    const r = (e) => (e ? e.getBoundingClientRect() : null);
    return { back: r(back), title: r(title) };
  });
  const overlap = boxes.back && boxes.title && !(boxes.title.right <= boxes.back.left || boxes.title.left >= boxes.back.right);
  check('ar: the recipe title is clear of the Back button', !!boxes.title && !overlap, JSON.stringify(boxes));
  await ctx.close();
}

{
  const { ctx, page } = await open({ ...base('ar'), meals: [{ id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'بيض', calories: 300, proteinG: 24, carbsG: 2, fatG: 20, portion: '3' }] }] }, '/', 'ar');
  const b = await body(page);
  check('ar: Overview grams are "غ", not Latin g', /126 غ/.test(b) && !/126 g/.test(b), b.match(/.{0,10}126.{0,10}/)?.[0]);
  await ctx.close();
}
for (const [path, title] of [['/food', 'الطعام'], ['/', 'نظرة عامة'], ['/training', 'التمرين']]) {
  const { ctx, page } = await open(planned('ar'), path, 'ar');
  await shot(page, `4-ar-tab${path.replace('/', '-') || '-overview'}`);
  const r = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('div,span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === t && getComputedStyle(e).opacity !== '0' && e.getBoundingClientRect().top < 120);
    return el ? { over: el.scrollWidth > el.clientWidth + 1, w: el.clientWidth, sw: el.scrollWidth } : null;
  }, title);
  check(`ar: the ${title} title shows in full`, !!r && !r.over, JSON.stringify(r));
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
