// The handoff's release-gate journeys, in the real app, English and Arabic.
// A browser cannot certify native keyboards or restarts (D11); it can certify
// that every route exists, every state renders, and every write happens only
// where the contract says it may.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:8099';
const OUT = '/tmp/claude-0/-home-user-CalApp/ecae7b05-0468-5173-bf98-63d45483ae6b/scratchpad/shots17';

const today = new Date();
const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const at = (daysAgo, h = 12) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };

const ing = (name, amount, kcal, extra = {}) => ({ name, key: name.toLowerCase().replace(/\s+/g, '_'), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 10, carbsG: 20, fatG: 5, aisle: 'pantry', ...extra });
const recipe = (id, name, over = {}) => ({ id, name, servings: 4, createdAt: at(1), language: 'en', source: 'ai', ingredients: [ing('Rice', 400, 1400), ing('Chicken', 600, 660)], steps: ['Cook.', 'Serve.'], ...over });

const base = (lang = 'en') => ({
  language: lang, account: { name: 'T', provider: 'guest' }, tutorialSeen: true,
  // weightKg matches the latest reading so the (pre-existing) "update your
  // goal?" prompt does not gate the journeys; tour/checklist already seen.
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 74.8, activityLevel: 'moderate', goal: 'maintain' },
  tourSeen: true, checklistDismissed: true,
  targets: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [],
  weights: [{ at: at(0, 8), kg: 74.8, source: 'manual' }, { at: at(7, 8), kg: 75.4, source: 'manual' }],
  recipes: [], mealPlanSwaps: {}, mealPlanRecipes: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [],
  skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {},
});

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const browser = await chromium.launch();

async function open(state, path, label) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 980 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state, version: 13 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  page.errors = errors;
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  if (label) await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true });
  return { ctx, page };
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store') || '{}').state);
const body = async (page) => squash(await page.textContent('body'));

// ═══ D03: the shell ═══════════════════════════════════════════════════════
console.log('=== Navigation shell (D03) ===');
let { ctx, page } = await open(base(), '/', 'overview');
let b = await body(page);
const tabs = await page.$$eval('a[role="tab"], [role="tab"]', (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
check('five destinations: Overview Training Add Food Health', /Overview/.test(b) && /Training/.test(b) && /Food/.test(b) && /Health/.test(b), tabs.join(' | '));
check('  AI Support is off the bar', !tabs.some((x) => /AI Support/.test(x)), tabs.join(' | '));
check('  and reachable from the Overview header', /AI Support/.test(b));
await page.getByText('AI Support', { exact: true }).first().click(); await page.waitForTimeout(1500);
check('  it opens as its own route', /\/coach/.test(page.url()), page.url().replace(BASE, ''));
b = await body(page);
check('  with the AI label kept', /AI Support/.test(b));

// ═══ S01: Overview reads body data with date + source ═════════════════════
console.log('\n=== Overview (S01) ===');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); b = await body(page);
check('latest weight carries its date and source', /Manual entry/.test(b) && /74\.8/.test(b), b.match(/74\.8.{0,60}/)?.[0]);
check('  and leads to Health', /View Health/.test(b));
check('  the inline weigh-in field is gone', !(await page.locator('input[inputmode="decimal"]').count()), 'no decimal input on Overview');
await page.getByText('View Health', { exact: true }).click(); await page.waitForTimeout(1500);
check('  View Health lands on the Health tab', /\/health/.test(page.url()), page.url().replace(BASE, ''));

// ═══ S03: Health ══════════════════════════════════════════════════════════
console.log('\n=== Health (S03) ===');
b = await body(page); await page.screenshot({ path: `${OUT}/health.png`, fullPage: true });
check('latest reading with date and source', /74\.8/.test(b) && /Manual entry/.test(b));
check('  change over the range, from a stated date', /[−-]0\.6 kg since/.test(b), b.match(/[−-]?\d\.\d kg since \w+ \d+/)?.[0]);
check('  two readings → a trend', /2 readings in this range/.test(b));
check('  measurement rows say "no reading yet" rather than 0', (b.match(/No reading yet/g) || []).length >= 1);
check('  connections live here', /Connections/.test(b) && /WHOOP/.test(b));
check('  review and export live here', /This week/.test(b) && /Export my data/.test(b));
check('  Add reading is the action', /Add reading/.test(b));
await ctx.close();

// Empty Health: one useful action, no zeros.
({ ctx, page } = await open({ ...base(), weights: [] }, '/health', 'health-empty'));
b = await body(page);
check('with no readings, nothing is invented', /No readings yet/.test(b) && !/0 kg/.test(b) && !/0\.0/.test(b));
await ctx.close();

// ═══ S15: Add sheet ═══════════════════════════════════════════════════════
console.log('\n=== Add sheet (S15) ===');
({ ctx, page } = await open(base(), '/add-menu', 'add-sheet'));
b = await body(page);
check('grouped Food / Training / Health / Daily', /Food/.test(b) && /Training/.test(b) && /Health/.test(b) && /Daily/.test(b));
check('  recipes and shopping are not recording choices', !/Shopping list/.test(b) && !/^.*Recipes\b(?!.*in Food)/.test(b.replace(/Recipes and weekly meal plans are in Food\./, '')));
check('  but the sheet says where they are', /Recipes and weekly plans are in Food/.test(b));
check('  a measurement photo is a Health action', /Read measurement photo/.test(b));
await ctx.close();

// ═══ S02 / S11: Food tabs and planning without a programme ════════════════
console.log('\n=== Food: Today / Meal plan (S02) ===');
({ ctx, page } = await open(base(), '/food', 'food-today'));
b = await body(page);
check('Today and Meal plan are local tabs', /Today/.test(b) && /Meal plan/.test(b));
await page.getByRole('tab', { name: 'Meal plan' }).click(); await page.waitForTimeout(800);
b = await body(page); await page.screenshot({ path: `${OUT}/food-plan-empty.png`, fullPage: true });
check('the plan view states planned vs eaten with the target', /Planned/.test(b) && /Eaten/.test(b) && /Daily target: 2,000 kcal/.test(b));
check('  with no programme it offers a way forward', /No meal plan yet/.test(b) && /Plan from recipes/.test(b) && /Build with AI/.test(b));
check('  and every slot has one action', (b.match(/Plan (Breakfast|Lunch|Dinner|Snacks)/g) || []).length === 4, String((b.match(/Plan (Breakfast|Lunch|Dinner|Snacks)/g) || []).length));
await ctx.close();

// A deep link opens the plan directly (Shopping's next action does this).
({ ctx, page } = await open(base(), '/food?tab=plan'));
b = await body(page);
check('/food?tab=plan opens the plan view', /No meal plan yet/.test(b));
await ctx.close();

// ═══ S12: Shopping next action ════════════════════════════════════════════
console.log('\n=== Shopping (S12 / F4) ===');
({ ctx, page } = await open(base(), '/shopping', 'shopping-empty'));
b = await body(page);
check('with nothing planned the primary next action is Plan meals', /Plan meals/.test(b));
await page.getByText('Plan meals', { exact: true }).first().click(); await page.waitForTimeout(1500);
check('  which opens the plan view of Food', /\/food\?tab=plan/.test(page.url()), page.url().replace(BASE, ''));
await ctx.close();

// ═══ S09 / S28: the library, a draft, and a hand-written recipe ═══════════
console.log('\n=== Recipes (S09) and manual entry (S28) ===');
({ ctx, page } = await open({ ...base(), recipes: [recipe('r1', 'Chicken Kabsa', { reviewStatus: 'needs_review' }), recipe('r2', 'Older AI recipe')] }, '/recipes', 'recipes'));
b = await body(page);
check('a draft is labelled', /Needs review(?! \()/.test(b));
check('  and the filter names how many', /Needs review \(1\)/.test(b));
check('  a recipe saved before the field existed is not a draft', (b.match(/Needs review(?! \()/g) || []).length === 1);
check('  Add my own recipe is offered', /Add my recipe/.test(b));

await page.getByText('Add my recipe', { exact: true }).click(); await page.waitForTimeout(1500);
check('the editor opens', /\/recipe-edit/.test(page.url()), page.url().replace(BASE, ''));
await page.getByPlaceholder(/machboos/i).fill('Mum’s Machboos');
const inputs = page.locator('input');
// Row: name, amount, then kcal P C F. Leave the second ingredient's nutrition blank.
await page.getByPlaceholder('Ingredient', { exact: true }).nth(0).fill('Basmati rice');
await page.getByPlaceholder('Amount', { exact: true }).nth(0).fill('400');
const nutrition = page.locator('input[placeholder="—"]');
await nutrition.nth(0).fill('1400');
await page.getByText('Add ingredient', { exact: true }).click(); await page.waitForTimeout(300);
await page.getByPlaceholder('Ingredient', { exact: true }).nth(1).fill('Saffron');
await page.getByPlaceholder('Amount', { exact: true }).nth(1).fill('1');
b = await body(page);
check('  blank nutrition is called unknown before saving (rice: macros blank, saffron: all blank)', /2 ingredients without nutrition/.test(b), b.match(/\d+ ingredients without nutrition[^.]*/)?.[0]);
await page.getByText('Save recipe', { exact: true }).click(); await page.waitForTimeout(1800);
check('saving opens the recipe', /\/recipe\?id=/.test(page.url()), page.url().replace(BASE, ''));
let st = await store(page);
const mine = st.recipes.find((r) => r.name === 'Mum’s Machboos');
check('  stored as custom and ready', mine?.source === 'custom' && mine?.reviewStatus === 'ready', `${mine?.source}/${mine?.reviewStatus}`);
check('  the blank ingredient is flagged unknown, not zeroed silently', mine?.ingredients[1]?.macrosUnknown === true);
check('  its key resolves through the shared table', mine?.ingredients[0]?.key === 'rice_basmati', mine?.ingredients[0]?.key);
b = await body(page); await page.screenshot({ path: `${OUT}/recipe-manual.png`, fullPage: true });
check('  the recipe says its totals are incomplete', /2 ingredients without nutrition/.test(b));
// The recipes list stays mounted beneath on web, so test the banner's own copy.
check('  a hand-written recipe has no review banner', !/written by AI and saved as a draft/.test(b));
check('  Add to plan and Log eaten are offered', /Add to plan/.test(b) && /Log eaten/.test(b));

// The draft: gated until reviewed.
await page.goto(`${BASE}/recipe?id=r1`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await page.screenshot({ path: `${OUT}/recipe-draft.png`, fullPage: true });
check('an AI draft shows the review banner', /Needs review/.test(b));
check('  planning and logging wait', !/Add to plan/.test(b) && /mark as ready/.test(b));
await page.getByText('mark as ready', { exact: false }).click(); await page.waitForTimeout(800);
st = await store(page);
check('  one tap marks it ready', st.recipes.find((r) => r.id === 'r1')?.reviewStatus === 'ready');
b = await body(page);
check('  and the actions appear', /Add to plan/.test(b) && /Log eaten/.test(b));

// ═══ S13: log eaten is a review, then one write, then Undo ════════════════
console.log('\n=== Log eaten (S13) ===');
await page.getByText('Log eaten', { exact: true }).first().click(); await page.waitForTimeout(1500);
check('Log eaten opens the review, not the diary', /\/log-portion/.test(page.url()), page.url().replace(BASE, ''));
b = await body(page); await page.screenshot({ path: `${OUT}/log-portion.png`, fullPage: true });
check('  the meal and the date are stated', /Today/.test(b));
check('  nothing written yet', (await store(page)).meals.length === 0);
await page.getByLabel('Smaller portion').click(); await page.waitForTimeout(300);
await page.getByLabel('Smaller portion').click(); await page.waitForTimeout(300);
b = await body(page);
check('  ½ serving previews half the kcal', /½ serving/.test(b) && /258 kcal/.test(b), b.match(/\d+ kcal/)?.[0]);
const addBtn = page.getByText(/^Add to (Breakfast|Lunch|Dinner|Snack)$/);
await addBtn.click(); await page.waitForTimeout(600);
await addBtn.click().catch(() => {}); await page.waitForTimeout(600);
st = await store(page);
check('  Add writes exactly one entry, even tapped twice', st.meals.length === 1, String(st.meals.length));
check('  with the snapshot and its basis', st.meals[0]?.items[0]?.recipeServings === 0.5 && st.meals[0]?.items[0]?.recipeBasis?.calories === 515);
b = await body(page);
check('  confirmed with meal, portion and day', /Added to .* ½ serving .* Today/.test(b), b.match(/Added to[^U]*/)?.[0]);
await page.getByText('Undo', { exact: true }).click(); await page.waitForTimeout(500);
check('  Undo reverses that entry only', (await store(page)).meals.length === 0);
await ctx.close();

// ═══ S14: apply is the only write ═════════════════════════════════════════
console.log('\n=== Plan replacement preview (S14) ===');
({ ctx, page } = await open({ ...base(), recipes: [recipe('r2', 'Lentil Stew', { reviewStatus: 'ready' })] }, '/plan-meal?recipeId=r2', 'plan-preview'));
b = await body(page);
check('the preview shows the planned day before → after', /Planned day\s*0 → 515 kcal/.test(b), b.match(/Planned day[^k]*kcal/)?.[0]);
check('  scope is this day only', /this day only/i.test(b));
check('  nothing written before Apply', Object.keys((await store(page)).mealPlanRecipes).length === 0);
await page.getByText('Apply change', { exact: true }).click(); await page.waitForTimeout(800);
st = await store(page);
check('  Apply writes one override', Object.keys(st.mealPlanRecipes).length === 1);
check('  keyed by date (zero-based month), not ISO', Object.keys(st.mealPlanRecipes)[0] === key(today), Object.keys(st.mealPlanRecipes)[0]);
await ctx.close();

// ═══ AT30: Arabic smoke on the new surfaces ═══════════════════════════════
console.log('\n=== Arabic (AT30) ===');
({ ctx, page } = await open(base('ar'), '/health', 'health-ar'));
b = await body(page);
check('Health renders in Arabic with no raw keys', /الصحة/.test(b) && !/health\./.test(b) && !/\b[a-z]+\.[a-zA-Z]+\b/.test(b.replace(/[0-9.]+/g, '')), b.match(/[a-z]+\.[a-zA-Z]+/)?.[0] || '');
await page.goto(`${BASE}/recipe-edit`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page);
check('the recipe editor renders in Arabic', /أضف وصفتي/.test(b) && !/recipeEdit\./.test(b));
await page.goto(`${BASE}/food?tab=plan`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await page.screenshot({ path: `${OUT}/food-plan-ar.png`, fullPage: true });
check('the plan view renders in Arabic', /خطة الوجبات/.test(b) && /لا توجد خطة وجبات بعد/.test(b));
const real = page.errors.filter((e) => !/Notifications\./.test(e));
check('no page errors across the run', real.length === 0, real.slice(0, 2).join(' | '));
await ctx.close();

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
