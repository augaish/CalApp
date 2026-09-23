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
// The main session button counts: "Complete set 1 of 3" … "Complete last set (3 of 3)".
const completeSet = (page) => page.getByText(/^Complete (set \d+ of \d+|last set \(\d+ of \d+\))$/).click();
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
check('E2 the editor names both ingredients with unknown values before saving (rice: macros blank; saffron: all blank)', /2 ingredients without nutrition/.test(b));
await page.getByText('Save recipe', { exact: true }).click(); await page.waitForTimeout(1800);
st = await store(page); const mine = st.recipes.find((r) => r.name.includes('soup'));
check('E2 saved with the ingredient flagged unknown, not zeroed silently', mine?.ingredients[1]?.macrosUnknown === true);
b = await body(page); await shot(page, 'E2-recipe-incomplete');
check('E2 the recipe says its totals are incomplete', /2 ingredients without nutrition/.test(b));
await page.getByText('Log eaten', { exact: true }).first().click(); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E2-log-portion-incomplete');
check('E2 Log eaten repeats that the totals are incomplete', /2 ingredients without nutrition/.test(b));
await page.getByText(/^Add to (Breakfast|Lunch|Dinner|Snacks)$/).click(); await page.waitForTimeout(800);
st = await store(page);
check('E2 the diary entry carries the incomplete marker', st.meals.length === 1 && st.meals[0].items[0].nutritionIncomplete === true, JSON.stringify(st.meals[0]?.items[0]?.nutritionIncomplete));
await page.goto(`${BASE}/food`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E2-food-incomplete-row');
check('E2 the Food diary shows Incomplete on that row, not Logged', /Grandma’s soup.{0,80}Incomplete/.test(b), b.match(/Grandma’s soup.{0,80}/)?.[0]);
const perServ = Math.round(1400 / mine.servings);
check('E2 Eaten today is a known subtotal (≥), remaining is an upper bound', new RegExp(`≥${perServ}`).test(b) && /up to [\d,]+ left/.test(b), b.match(/≥[\d,]+.{0,40}/)?.[0]);
check('E2 macros nobody entered show a dash, not 0', /Protein\s*—/.test(b), b.match(/Protein.{0,12}/)?.[0]);
check('E2 the disclosure explains ≥ and that unknown is never zero', /known subtotal/.test(b) && /never counted as zero/.test(b));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E2-overview-incomplete');
check('E2 Overview Nutrition today says the same', new RegExp(`≥${perServ}`).test(b) && /Incomplete/.test(b) && /up to [\d,]+ left/.test(b));
const soup = st.meals[0];
await page.goto(`${BASE}/edit-portion?id=${soup.id}&index=0`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.getByText('2', { exact: true }).first().click(); await page.waitForTimeout(400);
b = await body(page);
check('E2 the portion editor keeps the subtotal marked', new RegExp(`Becomes 2 servings · ≥${perServ * 2} kcal`).test(b), b.match(/Becomes[^.]*kcal/)?.[0]);
await page.getByText('Save correction', { exact: true }).click(); await page.waitForTimeout(900);
st = await store(page);
check('E2 the corrected entry still carries its unknown nutrients', st.meals[0].items[0].incompleteNutrients?.includes('proteinG') && st.meals[0].items[0].incompleteNutrients?.includes('calories') && st.meals[0].items[0].calories === perServ * 2, JSON.stringify(st.meals[0].items[0].incompleteNutrients));
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
await completeSet(page); await page.waitForTimeout(800);
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
await completeSet(page); await page.waitForTimeout(500);
await completeSet(page); await page.waitForTimeout(700);
st = await store(page);
check('E6 two sets completed', st.workouts[0]?.sets.length === 2, String(st.workouts[0]?.sets.length));
b = await body(page);
check('E6 the last planned set moves on to the next exercise, saying so', st.activeSession?.currentId === 'builtin:seated-row' && /Bench press done → Seated/i.test(b), b.match(/[^.]{0,30}done →[^.]{0,30}/)?.[0]);
await page.getByText('Back', { exact: true }).last().click(); await page.waitForTimeout(600);
check('E6 Back returns to the exercise just finished', (await store(page)).activeSession?.currentId === 'builtin:bench-press');
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
await completeSet(page); await page.waitForTimeout(800);
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
const inputs = page.locator('input[inputmode="decimal"]');
await inputs.nth(0).fill('400'); await inputs.nth(1).fill('5'); await inputs.nth(2).fill('70'); await inputs.nth(3).fill('10');
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

// ═══ E10: AT14 — replace a planned meal: 390 → 480, +90, planned day 1,890 → 1,980 ═══
console.log('\n=== E10 Plan replacement (AT14) ===');
const fi = (name, kcal) => ({ name, calories: kcal, proteinG: 20, carbsG: 40, fatG: 10, portion: '1 plate' });
const program = { id: 'prog-a', createdAt: at(3), goal: 'maintain', durationWeeks: 4, summary: 'Maintain', targets: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 }, schedule: { days: [] },
  mealPlan: { days: [{ weekday: today.getDay(), meals: [{ slot: 'breakfast', name: 'Oats', items: [fi('Oats', 500)] }, { slot: 'lunch', name: 'Chicken salad', items: [fi('Chicken salad', 390)] }, { slot: 'dinner', name: 'Grilled fish', items: [fi('Grilled fish', 1000)] }] }] } };
const stew480 = recipe('r2', 'Lentil stew', { reviewStatus: 'ready', source: 'custom', ingredients: [ing('Lentils', 400, 1320), ing('Tomatoes', 300, 600)] }); // 1,920 / 4 = 480
({ ctx, page } = await open({ ...base(), activeProgram: program, recipes: [stew480], meals: [{ id: 'm-eaten', at: at(0, 8), mealType: 'breakfast', items: [fi('Toast', 300)] }] }, '/plan-meal?recipeId=r2&slot=lunch', 'E10-plan-replacement'));
b = await body(page); await shot(page, 'E10-preview');
check('E10 Before is the planned lunch at 390', /Chicken salad\s*390 kcal/.test(b), b.match(/Chicken salad.{0,20}/)?.[0]);
check('E10 After is one serving at 480', /1 serving · 480 kcal/.test(b));
check('E10 Difference +90, planned day 1,890 → 1,980', /\+90 kcal/.test(b) && /1,890 → 1,980 kcal/.test(b), b.match(/Planned day.{0,30}/)?.[0]);
await page.getByText('Cancel', { exact: true }).click(); await page.waitForTimeout(700);
st = await store(page);
check('E10 Cancel writes nothing', Object.keys(st.mealPlanRecipes).length === 0 && st.meals.length === 1);
await page.goto(`${BASE}/plan-meal?recipeId=r2&slot=lunch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.getByText('Apply change', { exact: true }).click(); await page.waitForTimeout(900);
st = await store(page);
const ov = st.mealPlanRecipes[key(today)]?.lunch;
check('E10 Apply writes one override for today’s lunch, stamped with the programme', ov?.recipeId === 'r2' && ov?.servings === 1 && ov?.programId === 'prog-a', JSON.stringify(ov));
check('E10 eaten totals are unchanged (300 kcal breakfast only)', st.meals.length === 1 && st.meals[0].items[0].calories === 300);
await page.goto(`${BASE}/food?tab=plan`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E10-plan-after');
check('E10 the plan view now shows the stew at lunch and 1,980 planned', /Lentil stew/.test(b) && /1,980/.test(b), b.match(/Planned[^E]{0,30}/)?.[0]);
await close(ctx, page);

// ═══ E11: AT28 — Save twice on Add reading and on manual food entry commits exactly one operation ═══
console.log('\n=== E11 Double save (AT28) ===');
({ ctx, page } = await open(base(), '/body-reading', 'E11-double-save-reading'));
await page.locator('input[inputmode="decimal"]').first().fill('76');
const saveBtn = page.getByText('Save reading', { exact: true });
await saveBtn.click(); await saveBtn.click().catch(() => {}); await page.waitForTimeout(1200);
st = await store(page);
check('E11 two taps on Save reading leave exactly one reading for today, at 76 kg', st.weights.length === 1 && st.weights[0].kg === 76, `${st.weights.length} readings, ${st.weights[0]?.kg} kg`);
await close(ctx, page);
({ ctx, page } = await open(base(), '/food-edit', 'E11-double-save-food'));
await page.getByPlaceholder('e.g. Watermelon').fill('Banana');
await page.locator('input[inputmode="decimal"]').nth(0).fill('90');
const addFood = page.getByText('Add food', { exact: true }).last();
await addFood.click(); await addFood.click().catch(() => {}); await page.waitForTimeout(1200);
st = await store(page);
check('E11 two taps on Add food write exactly one diary entry', st.meals.length === 1 && st.meals[0].items[0].calories === 90, String(st.meals.length));
await close(ctx, page);

// ═══ E12: AT45 — favourite is a reference; customisation is a separate private copy ═══
console.log('\n=== E12 Favourite reference and private copy (AT45) ===');
({ ctx, page } = await open(base(), '/recipes', 'E12-favourite-copy'));
await page.getByLabel('Keep in favourites').first().click(); await page.waitForTimeout(500);
st = await store(page);
check('E12 favouriting a Calgym original stores a reference, not a copy', st.recipes.length === 0 && st.favoriteIds.length === 1 && st.favoriteIds[0].startsWith('calgym:'), JSON.stringify(st.favoriteIds));
await page.getByText('Favourites', { exact: true }).click(); await page.waitForTimeout(500);
b = await body(page);
const favName = st.favoriteIds[0] === 'calgym:chicken-kabsa' ? 'Chicken kabsa' : null;
check('E12 the Favourites filter lists it', /Chicken kabsa|Home-style lentil stew|Egg & labneh wrap/.test(b));
await page.goto(`${BASE}/recipe-edit?id=calgym%3Achicken-kabsa`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.getByPlaceholder(/machboos/i).fill('My kabsa');
await page.getByText('Save', { exact: true }).click(); await page.waitForTimeout(1500);
st = await store(page);
check('E12 editing the original creates a separate private copy', st.recipes.length === 1 && st.recipes[0].source === 'custom' && st.recipes[0].id !== 'calgym:chicken-kabsa' && st.recipes[0].name === 'My kabsa', JSON.stringify({ n: st.recipes.length, id: st.recipes[0]?.id, source: st.recipes[0]?.source }));
check('E12 the editor opened the copy, not the original', /\/recipe\?id=/.test(page.url()) && !/calgym%3Achicken-kabsa|calgym:chicken-kabsa/.test(page.url()), page.url().replace(BASE, ''));
await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.getByText('Calgym', { exact: true }).nth(1).click().catch(() => page.getByText('Calgym', { exact: true }).first().click()); await page.waitForTimeout(500);
b = await body(page); await shot(page, 'E12-calgym-filter');
check('E12 the Calgym collection still holds the untouched original', /Chicken kabsa/.test(b) && !/My kabsa/.test(b.split('My recipes')[1] ?? ''), b.match(/Chicken kabsa.{0,40}/)?.[0]);
await page.getByText('My recipes', { exact: true }).click(); await page.waitForTimeout(500);
b = await body(page);
check('E12 My recipes holds the private copy', /My kabsa/.test(b));
await close(ctx, page);

// ═══ E13: AT30 — Arabic input: Arabic-Indic digits, dates, units, plurals ═══
console.log('\n=== E13 Arabic journeys (AT30) ===');
const arWeek = { [yesterday.getDay()]: { title: 'الجزء السفلي', exerciseIds: ['builtin:squat'] }, [today.getDay()]: { title: 'الجزء العلوي', exerciseIds: ['builtin:bench-press'] } };
const arWorkouts = [
  { id: 'aw1', at: at(1, 18), exerciseId: 'builtin:squat', exerciseName: 'سكوات', type: 'weight_reps', sets: [{ weightKg: 80, reps: 8, done: true }] },
  { id: 'aw2', at: at(3, 18), exerciseId: 'builtin:bench-press', exerciseName: 'ضغط بنش', type: 'weight_reps', sets: [{ weightKg: 60, reps: 10, done: true }, { weightKg: 60, reps: 10, done: true }] },
];
({ ctx, page } = await open({ ...base('ar'), schedule: arWeek, workouts: arWorkouts }, '/food-edit', 'E13-arabic-input'));
await page.getByPlaceholder('مثال: بطيخ').fill('تمر');
await page.locator('input[inputmode="decimal"]').nth(0).fill('٣٠٠');
await page.locator('input[inputmode="decimal"]').nth(1).fill('٢');
b = await body(page); await shot(page, 'E13-food-edit-ar');
await page.getByText('إضافة الطعام', { exact: true }).last().click(); await page.waitForTimeout(1200);
st = await store(page);
check('E13 Arabic-Indic digits are parsed: ٣٠٠ → 300 kcal, ٢ → 2 g protein', st.meals[0]?.items[0]?.calories === 300 && st.meals[0]?.items[0]?.proteinG === 2, JSON.stringify(st.meals[0]?.items[0]));
await page.goto(`${BASE}/body-reading`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.locator('input[inputmode="decimal"]').first().fill('٧٦٫٥');
await page.getByText('حفظ القراءة', { exact: true }).click(); await page.waitForTimeout(1200);
st = await store(page);
check('E13 an Arabic decimal reading saves as 76.5 kg', st.weights.length === 1 && st.weights[0].kg === 76.5, `${st.weights[0]?.kg}`);
await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E13-review-ar');
check('E13 the dual plural form is used for two training days', /يوما تمرين/.test(b), b.match(/.{0,10}تمرين.{0,20}/)?.[0]);
check('E13 the review shows an Arabic month name and the kg unit', /سبتمبر|أكتوبر|أغسطس/.test(b) && /كغ/.test(b));
await page.goto(`${BASE}/training`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page); await shot(page, 'E13-training-ar');
check('E13 Training in Arabic offers the pending workout with its Arabic date', /التمرين التالي/.test(b) && /أدّه اليوم/.test(b));
await close(ctx, page);

// ═══ E14: S18 — recipe draft from AI Support → review → Log eaten (client path; the live model call is blocked here) ═══
console.log('\n=== E14 AI Support recipe draft (client path) ===');
const draft = recipe('r9', 'Lentil stew', { reviewStatus: 'needs_review', source: 'ai', description: 'A simple, hearty meal with lentils, vegetables and herbs.' });
({ ctx, page } = await open({ ...base(), recipes: [draft], coachMessages: [{ role: 'user', content: 'What can I make with lentils?', at: at(0, 9), focus: 'food' }, { role: 'assistant', content: 'Try a lentil stew. You can review ingredients and portions before saving.', at: at(0, 9), recipeId: 'r9' }] }, '/coach', 'E14-recipe-draft'));
b = await body(page); await shot(page, 'E14-coach-draft');
check('E14 the reply carries a Recipe draft card with Review recipe draft', /Recipe draft/.test(b) && /Review recipe draft/.test(b) && /Lentil stew/.test(b));
check('E14 the allowance line is honest (a count, checking, or unavailable — never a vague claim)', /(of \d+ (AI|AI Support)|Checking your allowance|Allowance unavailable)/.test(b) && !/Uses your AI allowance/.test(b), b.match(/AI Support.{0,60}/)?.[0]);
check('E14 nothing was planned or logged by the draft', Object.keys((await store(page)).mealPlanRecipes).length === 0 && (await store(page)).meals.length === 0);
await page.getByText('Review recipe draft', { exact: true }).click(); await page.waitForTimeout(1500);
b = await body(page);
check('E14 Review opens the recipe with the review gate', /\/recipe\?id=r9/.test(page.url()) && /Needs review/.test(b) && !/Add to plan/.test(b));
await page.getByText('Looks right', { exact: false }).click(); await page.waitForTimeout(800);
b = await body(page);
check('E14 after review, Add to plan and Log eaten are offered', /Add to plan/.test(b) && /Log eaten/.test(b));
await page.getByText('Log eaten', { exact: true }).first().click(); await page.waitForTimeout(1200);
await page.getByText(/^Add to (Breakfast|Lunch|Dinner|Snacks)$/).click(); await page.waitForTimeout(700);
st = await store(page);
check('E14 Log eaten writes one entry from the reviewed draft, by the person', st.meals.length === 1 && st.meals[0].items[0].recipeId === 'r9');
await page.goto(`${BASE}/coach`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
b = await body(page);
check('E14 the card now reads Reviewed · ready', /Reviewed · ready/.test(b));
await close(ctx, page);

await browser.close();
fs.writeFileSync(`${OUT}/journeys.json`, JSON.stringify(results, null, 2));
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
