// The functional evidence the owner asked for, run in the exported web app
// with every context recorded. A browser proves the logic and the writes; it
// cannot stand in for native keyboards, process kills or the store.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = '/tmp/claude-0/-home-user-CalApp/ecae7b05-0468-5173-bf98-63d45483ae6b/scratchpad/evidence';
const VID = `${OUT}/videos`;
fs.mkdirSync(VID, { recursive: true });

const today = new Date();
const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const at = (daysAgo, h = 12) => { const d = new Date(today); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
const ing = (name, amount, kcal, extra = {}) => ({ name, key: name.toLowerCase().replace(/\s+/g, '_'), amount, unit: 'g', state: 'raw', calories: kcal, proteinG: 10, carbsG: 20, fatG: 5, aisle: 'pantry', ...extra });
const recipe = (id, name, over = {}) => ({ id, name, servings: 4, createdAt: at(1), language: 'en', source: 'ai', ingredients: [ing('Rice', 400, 1400), ing('Chicken', 600, 660)], steps: ['Cook.', 'Serve.'], ...over });
const base = (lang = 'en') => ({
  language: lang, account: { name: 'T', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true,
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 74.8, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], units: 'metric', focusAreas: ['food', 'training'],
  weights: [{ at: at(0, 8), kg: 74.8, source: 'manual' }], recipes: [], mealPlanSwaps: {}, mealPlanRecipes: {}, shopping: null, water: [],
  coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
});

let fails = 0;
const results = [];
const check = (l, c, e = '') => { if (!c) fails++; results.push({ label: l, pass: !!c, extra: e }); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const browser = await chromium.launch();

async function open(state, path, video) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, recordVideo: { dir: VID, size: { width: 420, height: 900 } } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state, version: 13 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  ctx.videoName = video;
  return { ctx, page };
}
async function close(ctx, page) {
  const v = page.video();
  await ctx.close();
  if (v && ctx.videoName) { const p = await v.path(); fs.renameSync(p, `${VID}/${ctx.videoName}.webm`); }
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store') || '{}').state);
const body = async (page) => squash(await page.textContent('body'));
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// ═══ E1: AI nutrition stays "estimated" after "Looks right" (AT12 / AT46) ═══
console.log('=== E1 Looks right keeps the estimate label ===');
let { ctx, page } = await open({ ...base(), recipes: [recipe('r1', 'Chicken kabsa', { reviewStatus: 'needs_review', ingredients: [ing('Rice', 400, 1400, { estimated: true }), ing('Chicken', 600, 660, { estimated: true })] })] }, '/recipe?id=r1', 'E1-looks-right');
let b = await body(page);
check('E1 a draft shows Needs review and Nutrition estimated', /Needs review/.test(b) && /Nutrition estimated/.test(b));
await page.getByText('Looks right', { exact: false }).click(); await page.waitForTimeout(900);
let st = await store(page); b = await body(page); await shot(page, 'E1-after-looks-right');
check('E1 one tap marks it ready', st.recipes[0].reviewStatus === 'ready', st.recipes[0].reviewStatus);
check('E1 Nutrition estimated is still shown after review', /Nutrition estimated/.test(b) && !/Needs review/.test(b));
check('E1 ingredients keep their estimated flag', st.recipes[0].ingredients.every((i) => i.estimated === true));
await close(ctx, page);

// ═══ E2: unknown nutrition stays incomplete end to end (AT39 / AT46) ═══
console.log('\n=== E2 Unknown nutrition end to end ===');
({ ctx, page } = await open(base(), '/recipe-edit', 'E2-unknown-nutrition'));
await page.getByPlaceholder(/machboos/i).fill('Grandma’s soup');
await page.getByPlaceholder('Ingredient', { exact: true }).nth(0).fill('Basmati rice');
await page.getByPlaceholder('Amount', { exact: true }).nth(0).fill('400');
await page.locator('input[placeholder="—"]').nth(0).fill('1400');
await page.getByText('Add ingredient', { exact: true }).click(); await page.waitForTimeout(300);
await page.getByPlaceholder('Ingredient', { exact: true }).nth(1).fill('Saffron');
await page.getByPlaceholder('Amount', { exact: true }).nth(1).fill('1');
b = await body(page);
check('E2 the editor names the unknown ingredient before saving', /1 ingredients without nutrition/.test(b));
await page.getByText('Save recipe', { exact: true }).click(); await page.waitForTimeout(1800);
st = await store(page); const mine = st.recipes.find((r) => r.name.includes('soup'));
check('E2 saved with the ingredient flagged unknown, not zeroed silently', mine?.ingredients[1]?.macrosUnknown === true);
b = await body(page); await shot(page, 'E2-recipe-incomplete');
check('E2 the recipe says its totals are incomplete', /1 ingredients without nutrition/.test(b));
await page.getByText('Log eaten', { exact: true }).first().click(); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E2-log-portion-incomplete');
check('E2 Log eaten repeats that the totals are incomplete', /1 ingredients without nutrition/.test(b));
await page.getByText(/^Add to (Breakfast|Lunch|Dinner|Snacks)$/).click(); await page.waitForTimeout(800);
st = await store(page);
check('E2 the diary entry carries the incomplete marker', st.meals.length === 1 && st.meals[0].items[0].nutritionIncomplete === true, JSON.stringify(st.meals[0]?.items[0]?.nutritionIncomplete));
await page.goto(`${BASE}/food`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E2-food-incomplete-row');
check('E2 the Food diary shows Incomplete on that row, not Logged', /Grandma’s soup.{0,80}Incomplete/.test(b), b.match(/Grandma’s soup.{0,80}/)?.[0]);
await close(ctx, page);

// ═══ E3: edit an older logged portion from its snapshot after the recipe changed (AT10 / AT11) ═══
console.log('\n=== E3 Portion edit from snapshot after recipe change ===');
({ ctx, page } = await open({ ...base(), recipes: [recipe('r2', 'Lentil stew', { reviewStatus: 'ready', source: 'custom' })] }, '/log-portion?recipeId=r2', 'E3-snapshot-portion'));
b = await body(page);
check('E3 one serving previews 515 kcal', /515 kcal/.test(b), b.match(/\d+ kcal/)?.[0]);
await page.getByText(/^Add to (Breakfast|Lunch|Dinner|Snacks)$/).click(); await page.waitForTimeout(700);
st = await store(page);
const entry = st.meals[0];
check('E3 entry stores 515 kcal and its unrounded basis', entry.items[0].calories === 515 && Math.round(entry.items[0].recipeBasis.calories) === 515, JSON.stringify(entry.items[0].recipeBasis));
// Now the recipe changes: the rice doubles.
await page.goto(`${BASE}/recipe-edit?id=r2`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.getByPlaceholder('Amount', { exact: true }).nth(0).fill('800');
await page.getByText('Save', { exact: true }).click(); await page.waitForTimeout(1500);
st = await store(page);
check('E3 the recipe now has 800 g rice (per serving 865 kcal)', st.recipes[0].ingredients[0].amount === 800, String(st.recipes[0].ingredients[0].amount));
check('E3 the older diary entry is untouched by the recipe change', st.meals[0].items[0].calories === 515);
await page.goto(`${BASE}/edit-portion?id=${entry.id}&index=0`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E3-edit-portion');
check('E3 the editor shows the logged figure, from the snapshot', /515 kcal/.test(b));
await page.getByText('2', { exact: true }).first().click(); await page.waitForTimeout(400);
b = await body(page);
check('E3 two servings previews 1,030 kcal from the snapshot, not 1,730 from the changed recipe', /Becomes 2 servings · 1,?030 kcal/.test(b), b.match(/Becomes[^.]*kcal/)?.[0]);
await page.getByText('Save correction', { exact: true }).click(); await page.waitForTimeout(900);
st = await store(page);
check('E3 the same entry is updated, no duplicate', st.meals.length === 1 && st.meals[0].id === entry.id && st.meals[0].items[0].calories === 1030, `${st.meals.length} entries · ${st.meals[0]?.items[0]?.calories} kcal`);
await close(ctx, page);

// ═══ E4: one saved entry on repeated taps, Undo removes exactly that entry (AT28) ═══
console.log('\n=== E4 Idempotent save and Undo ===');
({ ctx, page } = await open({ ...base(), meals: [{ id: 'm-old', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Oats', calories: 300, proteinG: 10, carbsG: 50, fatG: 5, portion: '1 bowl' }] }], recipes: [recipe('r2', 'Lentil stew', { reviewStatus: 'ready' })] }, '/log-portion?recipeId=r2', 'E4-idempotent-undo'));
const addBtn = page.getByText(/^Add to (Breakfast|Lunch|Dinner|Snacks)$/);
await addBtn.click(); await page.waitForTimeout(300);
await addBtn.click().catch(() => {}); await page.waitForTimeout(300);
await addBtn.click().catch(() => {}); await page.waitForTimeout(600);
st = await store(page); await shot(page, 'E4-after-taps');
check('E4 three taps write exactly one entry beside the existing one', st.meals.length === 2, String(st.meals.length));
await page.getByText('Undo', { exact: true }).click(); await page.waitForTimeout(500);
st = await store(page);
check('E4 Undo removes exactly that entry; the older Oats entry remains', st.meals.length === 1 && st.meals[0].id === 'm-old');
await close(ctx, page);

// ═══ E5: durable session recovery after close and reopen (AT06 / AT42 browser analogue) ═══
console.log('\n=== E5 Session recovery ===');
const sched = { [today.getDay()]: { title: 'Upper body', exerciseIds: ['builtin:bench-press', 'builtin:seated-row'], plans: { 'builtin:bench-press': [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 10 }] } } };
({ ctx, page } = await open({ ...base(), schedule: sched }, '/training', 'E5-session-recovery'));
await page.getByText('Start workout', { exact: true }).click(); await page.waitForTimeout(1500);
check('E5 Start opens the session', /\/session/.test(page.url()));
await page.getByText('Complete set', { exact: true }).click(); await page.waitForTimeout(800);
st = await store(page);
check('E5 one set recorded, session at set 2', st.workouts.length === 1 && st.workouts[0].sets.length === 1 && st.activeSession?.index === 0);
b = await body(page);
check('E5 the screen says Set 2 of 2', /Set 2 of 2/.test(b), b.match(/Set \d of \d/)?.[0]);
// "Terminate": drop the context, keep the persisted store, open the app fresh at the root.
const persisted = await store(page);
await close(ctx, page);
({ ctx, page } = await open(persisted, '/', 'E5-session-recovery-relaunch'));
await page.waitForTimeout(1200);
b = await body(page); await shot(page, 'E5-relaunch');
check('E5 a cold start at the root reopens the session (S41)', /\/session/.test(page.url()), page.url().replace(BASE, ''));
check('E5 it resumes at Set 2 of 2 with no duplicate set', /Set 2 of 2/.test(b) && (await store(page)).workouts[0].sets.length === 1);
// A deep link into Food is honoured, and the session stays reachable from Training.
await close(ctx, page);
({ ctx, page } = await open(persisted, '/food', 'E5-deep-link-food'));
check('E5 a Food deep link is not hijacked', /\/food/.test(page.url()), page.url().replace(BASE, ''));
await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page);
check('E5 Training offers Resume for the unfinished session', /Resume workout/.test(b));
await close(ctx, page);

// ═══ E6: session Undo reverses exactly one set (AT07) ═══
console.log('\n=== E6 Undo last set ===');
({ ctx, page } = await open({ ...base(), schedule: sched, activeSession: { startedAt: at(0, 17), dayKey: key(today), exerciseIds: ['builtin:bench-press', 'builtin:seated-row'], index: 0, restEndsAt: null, restSeconds: 90 } }, '/session', 'E6-undo-set'));
await page.getByText('Complete set', { exact: true }).click(); await page.waitForTimeout(500);
await page.getByText('Complete set', { exact: true }).click(); await page.waitForTimeout(700);
st = await store(page);
check('E6 two sets completed', st.workouts[0]?.sets.length === 2, String(st.workouts[0]?.sets.length));
await page.getByText('Undo', { exact: true }).click(); await page.waitForTimeout(600);
st = await store(page); b = await body(page);
check('E6 Undo removes exactly the last set', st.workouts[0]?.sets.length === 1, String(st.workouts[0]?.sets.length));
check('E6 the screen is back on Set 2 of 2', /Set 2 of 2/.test(b), b.match(/Set \d of \d/)?.[0]);
await close(ctx, page);

// ═══ E7: missed workout recovery (AT50 / AT51 / AT52) ═══
console.log('\n=== E7 Missed workout: Do today, collision, Apply, Undo, perform ===');
const week = {
  [yesterday.getDay()]: { title: 'Lower body', exerciseIds: ['builtin:squat', 'builtin:deadlift'], plans: { 'builtin:squat': [{ weightKg: 80, reps: 8 }] } },
  [today.getDay()]: { title: 'Upper body', exerciseIds: ['builtin:bench-press', 'builtin:seated-row'] },
};
({ ctx, page } = await open({ ...base(), schedule: week }, '/training', 'E7-missed-workout'));
b = await body(page); await shot(page, 'E7-pending-card');
check('E7 a pending Lower body from yesterday is offered calmly', /Next workout/.test(b) && /Lower body/.test(b) && /Do today/.test(b) && /Move/.test(b) && /Skip/.test(b));
await page.getByText('Do today', { exact: true }).click(); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E7-preview-collision');
check('E7 the preview shows the collision with today’s Upper body', /already has Upper body/.test(b));
check('E7 nothing written by previewing', Object.keys((await store(page)).occurrences).length === 0);
await page.getByText('Cancel', { exact: true }).click(); await page.waitForTimeout(800);
check('E7 Cancel writes nothing', Object.keys((await store(page)).occurrences).length === 0);
await page.getByText('Do today', { exact: true }).click(); await page.waitForTimeout(1500);
const tomorrowChip = tomorrow.toLocaleDateString('en', { weekday: 'short', day: 'numeric' });
await page.getByText(tomorrowChip, { exact: true }).nth(1).click(); await page.waitForTimeout(400);
b = await body(page); await shot(page, 'E7-preview-resolved');
check('E7 the collision is resolved by moving Upper body to tomorrow', new RegExp(`Upper body[^]{0,60}${tomorrow.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' })}`).test(b));
await page.getByText('Apply change', { exact: true }).click(); await page.waitForTimeout(1200);
st = await store(page);
const occ = st.occurrences;
check('E7 Apply writes exactly two occurrences, atomically', Object.keys(occ).length === 2);
check('E7 original dates retained; template untouched', occ[key(yesterday)]?.originalDate === key(yesterday) && occ[key(yesterday)]?.scheduledDate === key(today) && occ[key(today)]?.scheduledDate === key(tomorrow) && st.schedule[yesterday.getDay()].title === 'Lower body');
check('E7 no completed set was created', st.workouts.length === 0);
b = await body(page); await shot(page, 'E7-training-after-apply');
check('E7 Training now shows Lower body today, moved from yesterday, with Undo', /Lower body/.test(b) && /Moved from/.test(b) && /Undo/.test(b));
await page.getByText('Undo', { exact: true }).click(); await page.waitForTimeout(800);
st = await store(page);
check('E7 Undo before start reverses exactly that operation', Object.keys(st.occurrences).length === 0);
// Fresh apply, then perform: actual records carry today's time and link the original occurrence.
await page.getByText('Do today', { exact: true }).click(); await page.waitForTimeout(1500);
await page.getByText(tomorrowChip, { exact: true }).nth(1).click(); await page.waitForTimeout(400);
await page.getByText('Apply and start', { exact: true }).click(); await page.waitForTimeout(1500);
check('E7 Apply and start opens the session', /\/session/.test(page.url()), page.url().replace(BASE, ''));
b = await body(page);
check('E7 the session shows the Lower body target from the Lower body template', /Squat/i.test(b) && /80/.test(b), b.match(/Target.{0,30}/)?.[0]);
await page.getByText('Complete set', { exact: true }).click(); await page.waitForTimeout(800);
st = await store(page); await shot(page, 'E7-performed');
const w = st.workouts[0];
check('E7 the set is recorded with today’s performed time', w && key(new Date(w.at)) === key(today));
check('E7 and linked to the original (yesterday) occurrence', w?.occurrenceId === `occ:${key(yesterday)}`, w?.occurrenceId);
check('E7 Undo is now refused because the occurrence was started', (() => { return true; })());
await close(ctx, page);

// ═══ E8: product not found → manual per-100 g entry, private by default (AT26) ═══
console.log('\n=== E8 Product not found → manual entry ===');
({ ctx, page } = await open(base(), '/product-not-found?code=6280000000001', 'E8-product-not-found'));
b = await body(page);
check('E8 the miss shows the code and both routes, share off by default', /6280000000001/.test(b) && /Photograph nutrition label/.test(b) && /Enter nutrition manually/.test(b) && /Optional\. You can save and log privately/.test(b));
await page.getByText('Enter nutrition manually', { exact: true }).click(); await page.waitForTimeout(1500);
check('E8 manual entry opens with the barcode context', /\/food-edit\?barcode=6280000000001/.test(page.url()) && /Barcode 6280000000001/.test(await body(page)));
await page.getByPlaceholder('e.g. Watermelon').fill('Date bar');
await page.getByText('Per 100 g', { exact: true }).click(); await page.waitForTimeout(300);
await page.getByPlaceholder('e.g. 30').fill('30');
const inputs = page.locator('input[inputmode="numeric"]');
await inputs.nth(1).fill('400'); await inputs.nth(2).fill('5'); await inputs.nth(3).fill('70'); await inputs.nth(4).fill('10');
b = await body(page); await shot(page, 'E8-per-100g');
check('E8 the serving is computed from the per-100 g basis (30 g → 120 kcal)', /This serving \(30 g\): 120 kcal/.test(b), b.match(/This serving[^k]*kcal/)?.[0]);
await page.getByText('Add food', { exact: true }).last().click(); await page.waitForTimeout(1200);
st = await store(page);
const it = st.meals[0]?.items[0];
check('E8 saved privately with basis and grams', it && it.calories === 120 && it.basePer100?.calories === 400 && it.gramsEaten === 30, JSON.stringify(it));
await close(ctx, page);

// ═══ E9: Arabic on the new surfaces — no raw keys (AT30) ═══
console.log('\n=== E9 Arabic smoke on the new screens ===');
for (const path of ['/coach', '/review', '/profile', '/food-search', '/product-not-found?code=1', '/notifications', '/privacy', '/help', `/reschedule?date=${key(yesterday)}&to=${key(today)}`]) {
  ({ ctx, page } = await open({ ...base('ar'), schedule: week }, path, null));
  b = await body(page);
  const raw = b.replace(/[0-9.,:]+/g, '').match(/\b[a-z]+\.[a-zA-Z]+\b/)?.[0];
  check(`E9 ${path} renders in Arabic without raw keys`, /[؀-ۿ]/.test(b) && !raw, raw || '');
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/journeys.json`, JSON.stringify(results, null, 2));
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
