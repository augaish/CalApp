// Health sources (App Store guideline 1.4.1): the page lists every method
// with its links, and the places that show health numbers lead to it —
// Edit daily targets, Health, Settings, Help, and the line under each AI
// Support reply. Arabic reads the same.
// Needs the web build on :8099 (qa/serve.mjs).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8099';
const SHOTS = process.env.SHOTS ?? '/tmp/sources-shots';
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const state = (language) => ({
  language, account: { name: 'Sara', provider: 'guest' }, tutorialSeen: true, tourSeen: true, tourSnoozed: 2, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-03-01', heightCm: 165, weightKg: 70, activityLevel: 'moderate', goal: 'lose', paceKgPerWeek: 0.5 },
  targets: { calories: 1654, proteinG: 140, carbsG: 150, fatG: 55 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, exercises: [], meals: [], weights: [{ id: 'w1', kg: 70, at: new Date().toISOString() }], recipes: [], water: [], workouts: [], fastingHistory: [], skips: {}, dayOrder: {}, dayExtras: {}, occurrences: {},
  coachMessages: [
    { role: 'user', content: 'How much protein should I eat?', at: new Date().toISOString() },
    { role: 'assistant', content: 'At 70 kg and losing weight, aim for about **140 g a day**.', at: new Date().toISOString() },
  ],
  notifyPrefs: { restAlertAsked: true }, membershipPrompt: { firstSeenAt: new Date().toISOString(), introShown: true, lastShownAt: new Date().toISOString() },
});
const browser = await chromium.launch();
const open = async (lang, path) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((v) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(v)); }, { state: state(lang), version: 16 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { ctx, page };
};
const text = (page) => page.evaluate(() => document.body.innerText);

// The page itself
let { ctx, page } = await open('en', '/sources');
let b = await text(page);
check('title and disclaimer', b.includes('Health sources') && b.includes('not medical advice'));
for (const s of ['Your daily targets', 'Health', 'Training', 'Food data and AI']) check(`section: ${s}`, b.includes(s));
for (const s of ['Calories you burn each day', 'Protein', 'Fat and carbs', 'BMI', 'Water', 'Fasting', 'Calories burned', 'Calories in food', 'AI estimates'])
  check(`topic: ${s}`, b.includes(s));
for (const s of ['Mifflin et al., Am J Clin Nutr, 1990', 'Morton et al., Br J Sports Med, 2018', 'WHO · Healthy diet', 'EFSA · Dietary reference values for water', 'Compendium of Physical Activities'])
  check(`citation: ${s}`, b.includes(s));
const links = await page.getByRole('link').count();
check('every citation is a link (18)', links === 18, String(links));
await page.screenshot({ path: `${SHOTS}-en-top.png` });
await page.mouse.wheel(0, 1400);
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}-en-more.png` });
await ctx.close();

// Where it's reached from
({ ctx, page } = await open('en', '/edit-targets'));
await page.getByText('How we calculate these, with sources', { exact: true }).click();
await page.waitForTimeout(800);
check('Edit daily targets → Health sources', (await text(page)).includes('Mifflin et al., Am J Clin Nutr, 1990'));
await ctx.close();

for (const path of ['/settings', '/help', '/health']) {
  ({ ctx, page } = await open('en', path));
  await page.getByText('Health sources', { exact: true }).first().click();
  await page.waitForTimeout(800);
  check(`${path} → Health sources`, (await text(page)).includes('Calories you burn each day'));
  await ctx.close();
}

({ ctx, page } = await open('en', '/coach'));
b = await text(page);
check('AI Support reply says what it is', b.includes('AI estimate, not medical advice'));
await page.screenshot({ path: `${SHOTS}-coach.png` });
await page.getByRole('link', { name: 'Health sources' }).first().click();
await page.waitForTimeout(800);
check('AI Support → Health sources', (await text(page)).includes('Calories you burn each day'));
await ctx.close();

// Arabic
({ ctx, page } = await open('ar', '/sources'));
b = await text(page);
check('Arabic page', b.includes('المصادر الصحية') && b.includes('ليس نصيحة طبية') && b.includes('البروتين') && b.includes('منظمة الصحة العالمية · النظام الغذائي الصحي'));
await page.screenshot({ path: `${SHOTS}-ar-top.png` });
await ctx.close();
({ ctx, page } = await open('ar', '/coach'));
check('Arabic AI note', (await text(page)).includes('تقدير بالذكاء الاصطناعي، وليس نصيحة طبية'));
await ctx.close();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
