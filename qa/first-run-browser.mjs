// A new person's first run and the pieces around it: the logo on the
// language screen; Male/Female on one line; the birth date picked by year →
// month → day; the steak on the protein tile; the welcome moment after a
// purchase (English and Arabic); the tour starting by itself with "Skip for
// now" / "Don't show again" and a hint where to find it; and the day
// calendar's jump to a month and year.
//
// Needs: the web build served on :8099 (node qa/serve.mjs).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8099';
const OUT = './qa-out/first-run';
fs.mkdirSync(OUT, { recursive: true });

const person = (language, extra = {}) => ({
  language, account: { name: 'Bader Augaish', provider: 'email', email: 'b@example.com' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true,
  units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 78, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 2400, proteinG: 150, carbsG: 260, fatG: 80 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], weights: [], recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {},
  shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
  ...extra,
});

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
async function open(state, path = '/', { keep = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (state) await ctx.addInitScript(([s, keepIt]) => { if (!keepIt || !localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, [{ state, version: 15 }, keep]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const body = (page) => page.evaluate(() => document.body.innerText);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('calapp-store') || '{}').state || {});

// ── Language screen: the logo, not a carrot ──
{
  const { ctx, page } = await open(null, '/');
  // A first visit: account first, then the language step of onboarding.
  const guest = page.getByText('Continue as guest', { exact: false });
  if (await guest.count()) { await guest.first().click(); await page.waitForTimeout(1000); }
  const b = await body(page);
  const logo = await page.locator('img[alt="Calgym"], [aria-label="Calgym"]').count();
  check('language screen: Calgym logo shown', /Welcome to Calgym/.test(b) && logo > 0, `logos=${logo}`);
  await page.screenshot({ path: `${OUT}/language.png` });

  // About you: Male and Female each on one line.
  await page.getByText('English', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const female = page.getByRole('radio', { name: 'Female' });
  const box = await female.locator('text=Female').boundingBox().catch(() => null);
  const lh = box ? box.height : 999;
  check('About you: "Female" on one line', lh < 30, `label height ${lh}`);
  await page.screenshot({ path: `${OUT}/about-you.png` });

  // Birth date: years first, then months, then days.
  await page.getByRole('button', { name: 'Birth date' }).first().click();
  await page.waitForTimeout(600);
  let s = await body(page);
  check('birth date opens on the years', /2001/.test(s) && /1990/.test(s) && !/\bS\s+M\s+T\s+W/.test(s));
  const y2001 = await page.getByRole('button', { name: '2001', exact: true }).boundingBox();
  check('…centred on the year it starts from (2001 in view)', !!y2001 && y2001.y > 420 && y2001.y < 800, JSON.stringify(y2001));
  check('…with the month arrows hidden', (await page.getByRole('button', { name: 'Previous month' }).count()) === 0 || !(await page.getByRole('button', { name: 'Previous month' }).isEnabled()));
  await page.screenshot({ path: `${OUT}/picker-years.png` });
  await page.getByRole('button', { name: '1995', exact: true }).click();
  await page.waitForTimeout(400);
  s = await body(page);
  check('then the months of 1995', /Jan/.test(s) && /Dec/.test(s));
  await page.getByRole('button', { name: 'March 1995' }).click();
  await page.waitForTimeout(400);
  s = await body(page);
  check('then the days of March 1995', /March 1995/.test(s));
  await page.screenshot({ path: `${OUT}/picker-days.png` });
  await page.getByRole('button', { name: /March 14/ }).click();
  await page.waitForTimeout(400);
  const val = await page.locator('input').first().inputValue().catch(() => '');
  check('the field holds 1995-03-14', /1995-03-14/.test(val) || /1995-03-14/.test(await body(page)), val);
  check('no page errors (first visit)', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ── Overview: the steak on the protein tile ──
{
  const { ctx, page } = await open(person('en'), '/');
  const tile = page.getByLabel(/protein/i).first();
  const svg = await tile.locator('svg path').count().catch(() => 0);
  check('protein tile draws the steak (3 paths)', svg >= 3, `paths=${svg}`);
  await tile.screenshot({ path: `${OUT}/protein-tile.png` }).catch(() => {});
  await ctx.close();
}

// ── Welcome moment ──
for (const lang of ['en', 'ar']) {
  const { ctx, page } = await open(person(lang, { tourSeen: false, tourSnoozed: 0, membershipPrompt: { firstSeenAt: new Date().toISOString(), introShown: true, lastShownAt: new Date().toISOString() } }), '/plan-welcome?tier=essentials&focus=training&trial=14');
  const b = await body(page);
  if (lang === 'en') {
    check('welcome: greets by first name', /You're in, Bader!/.test(b), b.slice(0, 80));
    check('welcome: plan pill Essentials · Training', /Essentials · Training/.test(b));
    check('welcome: trial lead with the days', /Your 14 free days include everything in Pro\./.test(b));
    check('welcome: three rows of what it unlocks', /Snap a meal, get the macros/.test(b) && /Your plan, rest timer and records/.test(b) && /Ask your coach anything/.test(b));
    check('welcome: a motivational line and the trial reminder note', /“.+”/.test(b) && /remind you 2 days before the trial ends/.test(b));
  } else {
    check('welcome AR: Arabic greeting, plan and button', /أهلاً بك يا Bader/.test(b) && /هيا نبدأ/.test(b) && /تجربتك المجانية لمدة 14 يوماً/.test(b), b.slice(0, 80));
  }
  await page.screenshot({ path: `${OUT}/welcome-${lang}.png` });
  if (lang === 'en') {
    await page.getByText("Let’s go", { exact: true }).click();
    await page.waitForTimeout(3500);
    const t = await body(page);
    check("Let's go lands on Overview and the tour starts", /1 \/ 9/.test(t) && /Skip for now/.test(t) && /Don't show again/.test(t), t.match(/\d \/ 9/)?.[0]);
    await page.screenshot({ path: `${OUT}/tour-auto.png` });
  }
  check(`welcome ${lang}: no page errors`, page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ── Tour: skip for now, then again once, then don't show again ──
{
  const fresh = person('en', { tourSeen: false, tourSnoozed: 0, membershipPrompt: { firstSeenAt: new Date().toISOString(), introShown: true, lastShownAt: null } });
  const { ctx, page } = await open(fresh, '/', { keep: true });
  await page.waitForTimeout(8000);
  let t = await body(page);
  check('new person: the tour starts by itself on Overview', /1 \/ 9/.test(t) && /Skip for now/.test(t));
  await page.getByText('Skip for now', { exact: true }).click();
  await page.waitForTimeout(700);
  t = await body(page);
  check('skip for now: the hint says where the tour lives', /Profile → Help & feedback → Replay tour/.test(t));
  await page.screenshot({ path: `${OUT}/tour-hint.png` });
  check('skip for now is remembered', (await stored(page)).tourSnoozed === 1 && !(await stored(page)).tourSeen);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  t = await body(page);
  check('next launch: offered once more', /1 \/ 9/.test(t));
  await page.getByText("Don't show again", { exact: true }).click();
  await page.waitForTimeout(700);
  check("don't show again: marked seen, hint shown", (await stored(page)).tourSeen === true && /Replay tour/.test(await body(page)));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  check('then it no longer starts by itself', !/1 \/ 9/.test(await body(page)));
  check('no page errors (tour)', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ── Day calendar: jump to a month and year ──
{
  const { ctx, page } = await open(person('en'), '/calendar');
  await page.getByRole('button', { name: 'Choose month and year' }).click();
  await page.waitForTimeout(400);
  check('calendar: years listed', /2026/.test(await body(page)) && /2024/.test(await body(page)));
  await page.getByRole('button', { name: '2025', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'February 2025' }).click();
  await page.waitForTimeout(300);
  check('calendar: February 2025 shown', /February 2025/.test(await body(page)));
  await page.screenshot({ path: `${OUT}/calendar-jump.png` });
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
