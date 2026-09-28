// The membership sheet: benefits, a way to subscribe (on the web: "coming
// soon", since there is no store), and every way out — X, "Not now" and a
// tap outside. Limits open it with their reason; it leads on to the full
// plans page and to code redemption.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/membership';
fs.mkdirSync(OUT, { recursive: true });
const state = (language) => ({
  language, account: { name: 'Alex', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {},
  shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
});

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
async function open(path, lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: state(lang), version: 15 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const body = (page) => page.evaluate(() => document.body.innerText);

{
  const { ctx, page } = await open('/membership');
  const b = await body(page);
  check('title and the question', /Choose how Calgym helps you/.test(b) && /What do you want help with\?/.test(b));
  check('Food, Training and Both offered; both-focus opens on Pro, recommended', ['Food', 'Training', 'Both'].every((x) => b.includes(x)) && /Pro\s*Recommended/.test(b) && /Everything in Food and in Training/.test(b), '');
  check('Pro shows its display price and 50 AI actions', /24\.99/.test(b) && /50 AI actions a month/.test(b));
  await page.getByRole('radio', { name: /Food$/ }).first().click();
  await page.waitForTimeout(400);
  const f = await body(page);
  check('choosing Food shows Essentials · Food with its own inclusions', /Essentials · Food/.test(f) && /Recipes, portions and meal planning/.test(f) && /19\.99/.test(f) && /20 AI actions a month/.test(f));
  check('Essentials offers Pro for the real difference', /Add Training too with Pro, for 5\.00 SAR more a month/.test(f));
  check('web: says subscriptions are coming, no buy button that cannot work', /Subscriptions coming soon/.test(b));
  check('"Have a code?" and "Compare plans" are offered', /Have a code\?/.test(b) && /Membership and usage/.test(b));
  await page.screenshot({ path: `${OUT}/sheet.png` });
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.waitForTimeout(600);
  check('"Not now" closes it', !/membership/.test(page.url()), page.url());
  await ctx.close();
}
{
  const { ctx, page } = await open('/membership');
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForTimeout(600);
  check('the X closes it', !/membership/.test(page.url()), page.url());
  await ctx.close();
}
{
  const { ctx, page } = await open('/membership');
  await page.mouse.click(195, 40);
  await page.waitForTimeout(600);
  check('a tap outside closes it', !/membership/.test(page.url()), page.url());
  await ctx.close();
}
{
  const { ctx, page } = await open('/membership?reason=coach');
  check('a limit opens it with its reason', /used your free coach messages/.test(await body(page)));
  await page.getByText('Membership and usage').click();
  await page.waitForTimeout(900);
  check('"Membership and usage" leads to the full page', /\/upgrade/.test(page.url()), page.url());
  await ctx.close();
}
{
  const { ctx, page } = await open('/membership');
  await page.getByText('Have a code?').click();
  await page.waitForTimeout(900);
  check('"Have a code?" leads to redemption', /\/redeem/.test(page.url()), page.url());
  await ctx.close();
}
{
  const { ctx, page } = await open('/membership', 'ar');
  const b = await body(page);
  check('Arabic: title, the question and Not now', /اختر كيف يساعدك كالجيم/.test(b) && /في ماذا تريد المساعدة/.test(b) && /ليس الآن/.test(b));
  await page.screenshot({ path: `${OUT}/sheet-ar.png` });
  await ctx.close();
}
{
  // The full page still sells from the same logic.
  const { ctx, page } = await open('/upgrade');
  check('the full plans page still renders its tiers', /Pro/.test(await body(page)) && /Have a code\?/.test(await body(page)));
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
