// Pass B checks in the exported web app: Health hero, AI Support layout and
// action cards, Overview links, and the multi-screen tour.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/passb';
fs.mkdirSync(OUT, { recursive: true });
const today = new Date();
const at = (d, h = 12) => { const x = new Date(today); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const seg = { leftArm: 3.2, rightArm: 3.3, trunk: 26.1, leftLeg: 9.4, rightLeg: 9.5 };
const base = (lang = 'en', over = {}) => ({
  language: lang, account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78.4, activityLevel: 'moderate', goal: 'lose' },
  targets: { calories: 2200, proteinG: 157, carbsG: 229, fatG: 73 },
  schedule: { [today.getDay()]: { title: 'Lower body', exerciseIds: ['builtin:squat', 'builtin:deadlift'] } }, savedSchedules: [], activeScheduleId: null,
  workouts: [], exercises: [],
  meals: [{ id: 'm1', at: at(0, 8), mealType: 'breakfast', items: [{ name: 'Tuna sandwich', calories: 420, proteinG: 30, carbsG: 45, fatG: 12, portion: '1 sandwich' }] }],
  weights: [
    { at: at(3, 8), kg: 78.4, bodyFatPercent: 20.6, skeletalMuscleMassKg: 35.2, segmentalLeanMassKg: seg, source: 'scan', reportLabel: 'InBody 270' },
    { at: at(20, 8), kg: 79.3, bodyFatPercent: 21.4, skeletalMuscleMassKg: 34.8, source: 'scan' },
  ],
  recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
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
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ═══ B1 Health hero ═══
console.log('=== B1 Health hero ===');
let { ctx, page } = await open(base(), '/health');
let b = await body(page); await shot(page, 'b1-health');
check('B1 hero shows weight, body fat, muscle, BMI with deltas', /78\.4 kg.?−0\.9 kg/.test(b) && /20\.6%.?−0\.8 pt/.test(b) && /35\.2 kg.?\+0\.4 kg/.test(b) && /BMI ?24\.7/.test(b), b.match(/Body composition.{0,160}/)?.[0]);
check('B1 date and source on the hero', /Sep \d+ · Scanned · InBody 270/.test(b));
check('B1 body map rendered (svg)', (await page.locator('svg').count()) > 0);
check('B1 no page errors', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();
({ ctx, page } = await open(base('en', { weights: [] }), '/health'));
b = await body(page); await shot(page, 'b1-health-empty');
check('B1 no readings: honest empty text and Add reading, no zeros', /No readings yet/.test(b) && /Add reading/.test(b) && !/0\.0 kg/.test(b));
await ctx.close();

// ═══ A3 Overview links ═══
console.log('\n=== A3 Overview links ===');
({ ctx, page } = await open(base(), '/'));
await page.getByLabel('Nutrition today · Food').click(); await page.waitForTimeout(900);
check('A3 Nutrition today card opens Food', /\/food/.test(page.url()), page.url().replace(BASE, ''));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
await page.getByLabel('Latest weight · Health').click(); await page.waitForTimeout(900);
check('A3 Latest weight card opens Health', /\/health/.test(page.url()), page.url().replace(BASE, ''));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
await page.getByLabel('Training · Training').click(); await page.waitForTimeout(900);
check('A3 Training step card opens Training', /\/training/.test(page.url()), page.url().replace(BASE, ''));
await ctx.close();

// ═══ B2/B3 AI Support: layout + a seeded reply with actions and chips ═══
console.log('\n=== B2/B3 AI Support ===');
const msgs = [
  { role: 'user', content: 'I think my breakfast is logged too low', at: at(0, 9), focus: 'food' },
  {
    role: 'assistant', at: at(0, 9),
    content: 'A tuna sandwich with mayo is usually nearer 520 kcal than 420 — the mayo and bread add up. Want me to correct it?',
    actions: [{ kind: 'updateFood', mealId: 'm1', itemIndex: 0, patch: { calories: 520, fatG: 20 }, note: 'Mayonnaise and two slices of bread.' }, { kind: 'logWater', ml: 500 }],
    suggestions: ['Log it for me', 'Recalculate without mayo', 'What should lunch be?'],
  },
];
({ ctx, page } = await open(base('en', { coachMessages: msgs }), '/coach'));
b = await body(page); await shot(page, 'b2-coach');
check('B2 one thin strip: a single AI Support header', (await page.locator('[role="heading"]', { hasText: 'AI Support' }).count()) === 1 && !/Back ?AI Support/.test(b));
check('B2 no focus tabs: no tablist above the thread', (await page.locator('[role="tablist"]').count()) === 0);
check('B2 no Manage shared context card in the body (moved to the strip)', !/Manage shared context/.test(b) && (await page.locator('[aria-label="Manage shared context"]').count()) === 1);
check('B3 action cards rendered with Update the entry and Add the water', /Change Tuna sandwich/.test(b) && /520 kcal · 20g fat/.test(b) && /Update the entry/.test(b) && /500 ml water/.test(b) && /Add the water/.test(b), b.match(/Change Tuna.{0,80}/)?.[0]);
check('B3 follow-up chips rendered', /Log it for me/.test(b) && /Recalculate without mayo/.test(b));
check('B3 nothing applied yet: diary still 420 kcal', (await store(page)).meals[0].items[0].calories === 420);
await page.getByText('Update the entry', { exact: true }).click(); await page.waitForTimeout(900);
let st = await store(page); b = await body(page); await shot(page, 'b3-applied');
check('B3 tap applies the correction through the store (520 kcal, 20 g fat)', st.meals[0].items[0].calories === 520 && st.meals[0].items[0].fatG === 20, JSON.stringify(st.meals[0].items[0]));
check('B3 card now reads Applied with Undo; the message persists it', /Applied/.test(b) && /Undo/.test(b) && st.coachMessages[1].actions[0].applied === true);
await page.getByText('Undo', { exact: true }).first().click(); await page.waitForTimeout(700);
st = await store(page);
check('B3 Undo restores 420 kcal', st.meals[0].items[0].calories === 420 && st.coachMessages[1].actions[0].applied === false);
await page.getByText('Add the water', { exact: true }).click(); await page.waitForTimeout(700);
st = await store(page);
check('B3 water action logs 500 ml', st.water.length === 1 && st.water[0].ml === 500);
check('B2/B3 no page errors', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();

({ ctx, page } = await open(base('en'), '/coach'));
b = await body(page); await shot(page, 'b2-coach-empty');
check('B2 empty thread shows starter chips and the intro', /What should I eat tonight\?/.test(b) && /Plan this week's training/.test(b) && /How am I trending\?/.test(b) && /Ask about your own numbers/.test(b));
await ctx.close();

// Arabic coach layout
({ ctx, page } = await open(base('ar', { coachMessages: msgs.map((m) => ({ ...m, content: m.role === 'user' ? 'أظن فطوري مسجّل أقل من الواقع' : 'ساندويتش التونة بالمايونيز أقرب إلى ٥٢٠ سعرة. أصحّحه؟', suggestions: m.suggestions ? ['سجّلها لي', 'أعد الحساب بدون مايونيز'] : undefined })) }), '/coach'));
b = await body(page); await shot(page, 'b2-coach-ar');
check('B2 AR: strip title, cards and chips in Arabic', /الدعم الذكي/.test(b) && /حدّث السجل/.test(b) && /سجّلها لي/.test(b) && /أضف الماء/.test(b));
check('B2 AR no page errors', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();

// ═══ B4 Tour across tabs ═══
console.log('\n=== B4 Tour ===');
({ ctx, page } = await open(base('en', { tourSeen: false }), '/'));
b = await body(page);
check('B4 banner offered on Overview', /Take the two-minute tour/.test(b));
await page.getByText('Take the two-minute tour', { exact: false }).click(); await page.waitForTimeout(2200);
b = await body(page); await shot(page, 'b4-step1');
check('B4 step 1 spotlights Your next steps on Overview', /1 \/ 9/.test(b) && /Overview opens on what to do next/.test(b), b.match(/\d \/ 9.{0,40}/)?.[0]);
const next = async () => { await page.getByText('Next', { exact: true }).click(); await page.waitForTimeout(2200); return body(page); };
b = await next();
check('B4 step 2 Nutrition today', /2 \/ 9/.test(b) && /never counted as zero/.test(b));
b = await next();
check('B4 step 3 Add anything, with Try it', /3 \/ 9/.test(b) && /Try it/.test(b));
b = await next();
await shot(page, 'b4-step4');
check('B4 step 4 moved to Training (schedule)', /4 \/ 9/.test(b) && /\/training/.test(page.url()) && /weekly schedule/.test(b), page.url().replace(BASE, ''));
b = await next();
check('B4 step 5 Today\'s workout', /5 \/ 9/.test(b));
b = await next();
await shot(page, 'b4-step6');
check('B4 step 6 moved to Food (tabs)', /6 \/ 9/.test(b) && /\/food/.test(page.url()) && /Today is your diary/.test(b), page.url().replace(BASE, ''));
b = await next();
check('B4 step 7 Recipes, shopping, review', /7 \/ 9/.test(b));
// Try it on step 7 opens Recipes, and coming back resumes on step 8 (Health).
await page.getByText('Try it', { exact: true }).click(); await page.waitForTimeout(1500);
check('B4 Try it opens the real Recipes screen and hides the tour', /\/recipes/.test(page.url()) && !/7 \/ 9/.test(await body(page)), page.url().replace(BASE, ''));
await page.goBack(); await page.waitForTimeout(2500); if (!/\/food|\/health/.test(page.url())) { await page.goto(`${BASE}/food`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500); }
b = await body(page); await shot(page, 'b4-step8');
check('B4 back from the excursion resumes on step 8 on Health', /8 \/ 9/.test(b) && /\/health/.test(page.url()), `${page.url().replace(BASE, '')} ${b.match(/\d \/ 9/)?.[0]}`);
b = await next();
await shot(page, 'b4-step9');
check('B4 step 9 AI Support in the header', /9 \/ 9/.test(b) && /Done/.test(b));
await page.getByText('Done', { exact: true }).click(); await page.waitForTimeout(800);
st = await store(page); b = await body(page);
check('B4 Done marks the tour seen and closes it', st.tourSeen === true && !/9 \/ 9/.test(b));
check('B4 no page errors', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
