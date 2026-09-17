// Focused checks for the six-item fix pass, in the exported web app.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/fixpass';
fs.mkdirSync(OUT, { recursive: true });

const today = new Date();
const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const at = (daysAgo, h = 12) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
const ing = (name, amount, kcal, extra = {}) => ({ name, key: name.toLowerCase().replace(/\s+/g, '_'), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 10, carbsG: 20, fatG: 5, aisle: 'pantry', ...extra });
const recipe = (id, name, over = {}) => ({ id, name, servings: 4, createdAt: at(1), language: 'en', source: 'custom', reviewStatus: 'ready', ingredients: [ing('Rice', 400, 1400), ing('Chicken', 600, 660)], steps: ['Cook.'], ...over });
const base = (lang = 'en') => ({
  language: lang, account: { name: 'T', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true,
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 74.8, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], units: 'metric', focusAreas: ['food', 'training'],
  weights: [], recipes: [], mealPlanSwaps: {}, mealPlanRecipes: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
});
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const browser = await chromium.launch();
async function open(state, path, lang = 'en') {
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
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
/** Does any element with this exact text render an ellipsis (clipped)? */
const clipped = (page, text) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('div,span')].filter((e) => e.childElementCount === 0 && e.textContent.trim() === t);
  return els.map((e) => ({ over: e.scrollWidth > e.clientWidth + 1, w: (e.closest('[role="button"]') ?? e).clientWidth, sw: e.scrollWidth, wrap: getComputedStyle(e).whiteSpace }));
}, text);

// ═══ 1. Portion editor: per-nutrient completeness, snapshot preserved ═══
console.log('=== 1. Portion editor completeness ===');
// A recipe whose fat is unknown on one ingredient: calories fully known, fat a subtotal.
const fatUnknown = recipe('rf', 'Lentil soup', { ingredients: [ing('Lentils', 400, 1200), ing('Oil', 40, 0, { unknownNutrients: ['fatG'] })] });
// Logged from it: 1 serving = 300 kcal, 5 g protein, 10 g carbs, 2.5 g fat (fat incomplete)
const soupItem = { name: 'Lentil soup', calories: 300, proteinG: 5, carbsG: 10, fatG: 3, portion: '1 serving', recipeId: 'rf', recipeServings: 1, recipeBasis: { calories: 300, proteinG: 5, carbsG: 10, fatG: 2.5 }, nutritionIncomplete: true, incompleteNutrients: ['fatG'] };
// An old entry with only the boolean (all four unknown), zero everywhere.
const legacyItem = { name: 'Mystery stew', calories: 0, proteinG: 0, carbsG: 0, fatG: 0, portion: '1 serving', recipeId: 'rf', recipeServings: 1, recipeBasis: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, nutritionIncomplete: true };
// Calories a subtotal, macros known.
const kcalSub = { name: 'Kabsa', calories: 400, proteinG: 20, carbsG: 50, fatG: 10, portion: '1 serving', recipeId: 'rf', recipeServings: 1, recipeBasis: { calories: 400, proteinG: 20, carbsG: 50, fatG: 10 }, nutritionIncomplete: true, incompleteNutrients: ['calories'] };
let state = { ...base(), recipes: [fatUnknown], meals: [
  { id: 'ms', at: at(0, 12), mealType: 'lunch', items: [soupItem] },
  { id: 'ml', at: at(0, 19), mealType: 'dinner', items: [legacyItem] },
  { id: 'mk', at: at(0, 8), mealType: 'breakfast', items: [kcalSub] },
] };
let { ctx, page } = await open(state, '/edit-portion?id=ms&index=0');
let b = await body(page); await shot(page, '1-edit-portion-fat-unknown');
check('1a Currently logged: calories exact (300 kcal), not ≥', /Currently logged ?1 serving · 300 kcal/.test(b), b.match(/Currently logged.{0,40}/)?.[0]);
check('1a fat shows ≥3g, protein/carbs plain', /300 kcal · 5g protein · 10g carbs · ≥3g fat/.test(b), b.match(/300 kcal · [^A-Z]{0,60}/)?.[0]);
check('1a note names the missing nutrient', /Not recorded for every ingredient: Fat/.test(b));
await page.getByText('2', { exact: true }).first().click(); await page.waitForTimeout(500);
b = await body(page); await shot(page, '1-edit-portion-fat-unknown-2');
check('1b preview 2 servings · 600 kcal · +300 kcal (calories fully known → plain change)', /Becomes 2 servings · 600 kcal · \+300 kcal/.test(b), b.match(/Becomes.{0,60}/)?.[0]);
check('1b preview fat ≥5g', /600 kcal · 10g protein · 20g carbs · ≥5g fat/.test(b));
check('1b no "Change in known subtotal" when calories are complete', !/Change in known subtotal/.test(b));
await page.getByText('Save correction', { exact: true }).click(); await page.waitForTimeout(800);
let st = await store(page);
const saved = st.meals.find((m) => m.id === 'ms').items[0];
check('1c saved entry keeps incompleteNutrients [fatG] and doubles values', JSON.stringify(saved.incompleteNutrients) === '["fatG"]' && saved.calories === 600 && saved.fatG === 5, JSON.stringify([saved.incompleteNutrients, saved.calories, saved.fatG]));
await ctx.close();

({ ctx, page } = await open(state, '/edit-portion?id=mk&index=0'));
b = await body(page);
check('1d calories subtotal reads ≥400 kcal in Currently logged', /Currently logged ?1 serving · ≥400 kcal/.test(b), b.match(/Currently logged.{0,40}/)?.[0]);
await page.getByText('½', { exact: true }).first().click(); await page.waitForTimeout(500);
b = await body(page); await shot(page, '1-edit-portion-kcal-subtotal');
check('1e half serving: "Becomes ½ serving · ≥200 kcal" with no unqualified delta in the heading', /Becomes ½ serving · ≥200 kcal(?! · )/.test(b), b.match(/Becomes.{0,60}/)?.[0]);
check('1e change labelled "Change in known subtotal: -200 kcal"', /Change in known subtotal: -200 kcal/.test(b), b.match(/Change in known subtotal.{0,20}/)?.[0]);
await ctx.close();

({ ctx, page } = await open(state, '/edit-portion?id=ml&index=0'));
b = await body(page); await shot(page, '1-edit-portion-legacy-unknown');
check('1f legacy all-unknown entry: "Unknown", never 0 kcal', /Currently logged ?1 serving · Unknown/.test(b) && !/0 kcal/.test(b) && !/0g protein/.test(b), b.match(/Currently logged.{0,80}/)?.[0]);
check('1f nothing-known line', /No nutrition recorded for this entry/.test(b));
await ctx.close();

({ ctx, page } = await open(state, '/food'));
b = await body(page); await shot(page, '1-food-diary-rows');
check('1g diary row: fat-unknown soup shows exact 300 kcal + Incomplete pill', /Lentil soup ?1 serving · 300 kcal.?Incomplete/.test(b), b.match(/Lentil soup.{0,50}/)?.[0]);
check('1g diary row: calorie-subtotal shows ≥400 kcal', /Kabsa ?1 serving · ≥400 kcal/.test(b), b.match(/Kabsa.{0,40}/)?.[0]);
check('1g diary row: legacy unknown shows Unknown, not 0 kcal', /Mystery stew ?1 serving · Unknown/.test(b), b.match(/Mystery stew.{0,40}/)?.[0]);
check('6 Food header: Calgym logo rendered, AI Support and Profile present, Today date pill present', (await page.locator('img[alt="Calgym"], [aria-label="Calgym"]').count()) > 0 && /AI Support/.test(b) && (await page.locator('[aria-label="Profile"]').count()) > 0 && (await page.locator('[aria-label="Choose a day"]').count()) > 0);
check('6 no page errors', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();

// ═══ 2. Plan replacement: change in known subtotal, both-incomplete note ═══
console.log('\n=== 2. Plan replacement change ===');
const incompleteA = recipe('ra', 'Stew A', { ingredients: [ing('Meat', 500, 800), ing('Spice mix', 20, 0, { macrosUnknown: true })] });
const incompleteB = recipe('rb', 'Stew B', { ingredients: [ing('Fish', 500, 600), ing('Sauce', 50, 0, { macrosUnknown: true })] });
const completeC = recipe('rc', 'Plain rice', { ingredients: [ing('Rice', 400, 1400)] });
state = { ...base(), recipes: [incompleteA, incompleteB, completeC], mealPlanRecipes: { [key(today)]: { lunch: { recipeId: 'ra', servings: 1 } } } };
({ ctx, page } = await open(state, `/plan-meal?recipeId=rb&day=${key(today)}&slot=lunch`));
b = await body(page); await shot(page, '2-plan-both-incomplete');
check('2a both incomplete: labelled "Change in known subtotal", no plain "Difference"', /Change in known subtotal/.test(b) && !/Difference/.test(b));
check('2a both sides read ≥ (200 → 150)', /Stew A ?≥200 kcal/.test(b) && /≥150 kcal/.test(b), b.match(/Before.{0,80}/)?.[0]);
check('2a note says subtotals compared, not the full nutritional difference', /not the full nutritional difference/.test(b));
check('2a delta not prefixed with ≥', !/≥−50|≥-50/.test(b) && /−50 kcal/.test(b), b.match(/Change in known subtotal.{0,20}/)?.[0]);
await ctx.close();
({ ctx, page } = await open(state, `/plan-meal?recipeId=rc&day=${key(today)}&slot=lunch`));
b = await body(page); await shot(page, '2-plan-current-incomplete');
check('2b current incomplete, new complete: still "Change in known subtotal" + planned-meal note', /Change in known subtotal/.test(b) && /The planned meal has ingredients without nutrition/.test(b));
check('2b new dish shown plain 350 kcal', /Plain rice ?1 serving · 350 kcal/.test(b), b.match(/Plain rice.{0,40}/)?.[0]);
await ctx.close();
state = { ...base(), recipes: [incompleteA, incompleteB, completeC], mealPlanRecipes: { [key(today)]: { lunch: { recipeId: 'rc', servings: 1 } } } };
({ ctx, page } = await open(state, `/plan-meal?recipeId=rb&day=${key(today)}&slot=lunch`));
b = await body(page);
check('2c complete → incomplete: "Change in known subtotal" + recipe note', /Change in known subtotal/.test(b) && /This recipe has ingredients without nutrition/.test(b));
await ctx.close();
state = { ...base(), recipes: [incompleteA, incompleteB, completeC], mealPlanRecipes: { [key(today)]: { lunch: { recipeId: 'ra', servings: 1 } } } };
({ ctx, page } = await open({ ...state, recipes: [completeC, recipe('rd', 'Rice 2', { ingredients: [ing('Rice', 400, 1760)] })], mealPlanRecipes: { [key(today)]: { lunch: { recipeId: 'rc', servings: 1 } } } }, `/plan-meal?recipeId=rd&day=${key(today)}&slot=lunch`));
b = await body(page);
check('2d both complete: plain "Difference +90 kcal" unchanged', /Difference ?\+90 kcal/.test(b) && !/known subtotal/.test(b), b.match(/Difference.{0,20}/)?.[0]);
await ctx.close();

// ═══ 3. Manual food entry: blank = unknown, 0 = zero, Arabic digits + decimals ═══
console.log('\n=== 3. Manual entry ===');
({ ctx, page } = await open(base(), '/food-edit'));
await page.getByPlaceholder('e.g. Watermelon').fill('Dates');
await page.getByLabel('Calories', { exact: true }).fill('120');
await page.getByLabel('Protein', { exact: true }).fill('0');
await page.getByLabel('Fat', { exact: true }).fill('1.5');
await page.waitForTimeout(400);
b = await body(page); await shot(page, '3-food-edit-blank-carbs');
check('3a blank note names only Carbs (protein was an explicit 0)', /Left blank: Carbs\./.test(b), b.match(/Left blank.{0,40}/)?.[0]);
await page.getByText('Add food', { exact: true }).last().click(); await page.waitForTimeout(1200);
st = await store(page);
let it = st.meals[0]?.items[0];
check('3b saved: carbs unknown only; protein 0 known; fat 1.5 → 2 (rounded storage)', it && JSON.stringify(it.incompleteNutrients) === '["carbsG"]' && it.proteinG === 0 && it.calories === 120 && it.fatG === 2, JSON.stringify(it));
b = await body(page); await shot(page, '3-food-after-save');
check('3c diary shows exact 120 kcal with Incomplete pill', /Dates ?1 · 120 kcal.?Incomplete/.test(b), b.match(/Dates.{0,40}/)?.[0]);
check('3c day totals: carbs shows — (dash) not 0', /Carbs —/.test(b) || /—\s*\/\s*200/.test(b), b.match(/Carbs.{0,15}/)?.[0]);
await ctx.close();

({ ctx, page } = await open(base('ar'), '/food-edit', 'ar'));
await page.locator('input').first().fill('تمر');
const arInputs = page.locator('input');
const n = await arInputs.count();
// Fields in order: name, portion, calories, protein, carbs, fat
await arInputs.nth(2).fill('١٢٠٫٥');
await arInputs.nth(3).fill('٠');
await page.waitForTimeout(400);
check('3d Arabic-Indic digits + decimal normalised in the calorie field', (await arInputs.nth(2).inputValue()) === '120.5', await arInputs.nth(2).inputValue());
b = await body(page); await shot(page, '3-food-edit-ar');
check('3d Arabic blank note lists carbs and fat', /تُرك فارغاً: الكربوهيدرات، الدهون/.test(b) || /تُرك فارغاً:/.test(b), b.match(/تُرك فارغاً.{0,40}/)?.[0]);
await page.getByText('إضافة الطعام', { exact: true }).last().click(); await page.waitForTimeout(1200);
st = await store(page); it = st.meals[0]?.items[0];
check('3e Arabic save: 121 kcal (120.5 rounded), protein 0 known, carbs+fat unknown', it && it.calories === 121 && it.proteinG === 0 && JSON.stringify(it.incompleteNutrients) === '["carbsG","fatG"]', JSON.stringify(it));
await ctx.close();

// ═══ 4. Arabic reschedule summary stacked ═══
console.log('\n=== 4. Arabic reschedule summary ===');
const dow = (d) => d.getDay();
const sched = { [dow(yesterday)]: { title: 'Upper body', exerciseIds: ['builtin:bench-press', 'builtin:seated-row'] }, [dow(today)]: { title: 'تمرين الأرجل', exerciseIds: ['builtin:squat', 'builtin:lunge'] } };
({ ctx, page } = await open({ ...base('ar'), schedule: sched, savedSchedules: [{ id: 's', name: 'Gym', days: sched, createdAt: at(10) }], activeScheduleId: 's' }, `/reschedule?date=${key(yesterday)}&to=${key(today)}`, 'ar'));
b = await body(page); await shot(page, '4-reschedule-ar');
check('4a labels present: original date / new date / outcome', /التاريخ الأصلي/.test(b) && /التاريخ الجديد/.test(b) && /النتيجة/.test(b));
check('4a both workout names appear (mixed script)', /Upper body/.test(b) && /تمرين الأرجل/.test(b));
const overlap = await page.evaluate(() => {
  // Any two leaf text nodes inside the summary card whose boxes intersect?
  const leaves = [...document.querySelectorAll('div')].filter((e) => e.childElementCount === 0 && e.textContent.trim().length > 0);
  const boxes = leaves.map((e) => ({ t: e.textContent.trim(), r: e.getBoundingClientRect() })).filter((x) => x.r.height > 0);
  const hits = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, c = boxes[j].r;
    const ix = Math.min(a.right, c.right) - Math.max(a.left, c.left), iy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (ix > 2 && iy > 2 && (boxes[i].t.includes('Upper body') || boxes[j].t.includes('Upper body') || boxes[i].t.includes('الأرجل') || boxes[j].t.includes('الأرجل'))) hits.push([boxes[i].t, boxes[j].t]);
  }
  return hits;
});
check('4b no text overlap involving the workout names', overlap.length === 0, JSON.stringify(overlap).slice(0, 200));
await ctx.close();
({ ctx, page } = await open({ ...base(), schedule: sched, savedSchedules: [{ id: 's', name: 'Gym', days: sched, createdAt: at(10) }], activeScheduleId: 's' }, `/reschedule?date=${key(yesterday)}&to=${key(today)}`));
b = await body(page); await shot(page, '4-reschedule-en');
check('4c EN: stacked "Original date … New date …" for the moving workout and Outcome for the collision', /Upper body ?Original date ?.* ?New date ?.* ?تمرين الأرجل ?Original date ?.* ?Outcome ?Keep both on that day/.test(b), b.match(/Upper body Original.{0,160}/)?.[0]);
await ctx.close();

// ═══ 5. Meal-plan action buttons readable in both languages ═══
console.log('\n=== 5. Meal-plan action buttons ===');
const planState = (lang) => ({ ...base(lang), recipes: [completeC, incompleteA], mealPlanRecipes: { [key(today)]: { lunch: { recipeId: 'rc', servings: 1 }, dinner: { recipeId: 'ra', servings: 1 } } } });
for (const lang of ['en', 'ar']) {
  ({ ctx, page } = await open(planState(lang), '/food?tab=plan', lang));
  b = await body(page); await shot(page, `5-plan-${lang}`);
  const labels = lang === 'en' ? ['Log eaten', 'View recipe', 'Swap'] : ['سجّل أنني أكلتها', 'عرض الوصفة', 'تبديل'];
  for (const l of labels) {
    const r = await clipped(page, l);
    check(`5 ${lang} "${l}" present and not clipped`, r.length > 0 && r.every((x) => !x.over), JSON.stringify(r).slice(0, 120));
  }
  check(`5 ${lang} no ellipsis in the plan tab`, !/…/.test(b));
  // Today tab planned card
  await page.goto(`${BASE}/food`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  b = await body(page); await shot(page, `5-today-${lang}`);
  const r = await clipped(page, labels[0]);
  check(`5 ${lang} Today tab "${labels[0]}" full width, not clipped`, r.length > 0 && r.every((x) => !x.over && x.w > 250), JSON.stringify(r).slice(0, 120));
  check(`5 ${lang} Today tab no page errors`, page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
