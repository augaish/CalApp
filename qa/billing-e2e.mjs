// Promotion codes end to end: the admin console creates codes, the app (web
// build pointed at a local server on a real Postgres) redeems them, and the
// counters, the plan and the upgrade screen all follow.
//
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin and a database; a
// web export built with EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 served on
// :8098. The web build sells nothing (subscriptions are App Store / Play
// only), so the store-purchase half is covered by unit tests instead.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const APP = 'http://127.0.0.1:8098';
const API = 'http://127.0.0.1:8787';
const OUT = './qa-out/billing';
fs.mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36).toUpperCase();
const FREE = `GYM${run}`;
const HALF = `HALF${run}`;
const ONE = `ONE${run}`;

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const squash = (s) => s.replace(/\s+/g, ' ');
const browser = await chromium.launch();

const base = (lang, installId) => ({
  language: lang, installId, account: { name: 'Sam', provider: 'guest' }, tutorialSeen: true, tourSeen: true, checklistDismissed: true, units: 'metric', focusAreas: ['food', 'training'],
  profile: { sex: 'female', birthDate: '1994-01-01', heightCm: 165, weightKg: 62, activityLevel: 'moderate', goal: 'maintain' },
  targets: { calories: 1900, proteinG: 120, carbsG: 210, fatG: 63 },
  schedule: {}, savedSchedules: [], activeScheduleId: null, workouts: [], exercises: [], meals: [], weights: [],
  recipes: [], mealPlanRecipes: {}, mealPlanSwaps: {}, shopping: null, water: [], coachMessages: [], fastingHistory: [], skips: {}, dayOrder: {}, whoopBurnByDay: {}, whoopWorkoutsByDay: {}, occurrences: {},
});
async function openApp(path, lang = 'en', installId = `u_e2e${run}${lang}`) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('calapp-store')) localStorage.setItem('calapp-store', JSON.stringify(s)); }, { state: base(lang, installId), version: 13 });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page, installId };
}
const body = async (page) => squash(await page.textContent('body'));
const me = (ref) => fetch(`${API}/api/me`, { headers: { 'x-calgym-user': ref } }).then((r) => r.json());
const adminGet = (path) => fetch(`${API}${path}`, { headers: { 'x-admin-token': 'e2e-admin' } }).then((r) => r.json());

// ═══ Admin console: create codes ═══
console.log('=== Admin console ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
  await page.fill('#token', 'e2e-admin');
  await page.getByRole('button', { name: /sign in|open|enter/i }).first().click();
  await page.waitForSelector('#codes', { state: 'visible' });

  // A free code: 90 days of Pro, two people.
  await page.fill('#pc_code', FREE.toLowerCase());
  await page.fill('#pc_days', '90');
  await page.fill('#pc_max', '2');
  await page.fill('#pc_note', 'e2e gym partner');
  await page.click('text=Save code');
  await page.waitForTimeout(700);
  check('admin: a free code saves (typed lower case, stored upper)', (await page.textContent('#pc_msg')).includes(`Saved ${FREE}`), await page.textContent('#pc_msg'));

  // A percent code missing its store offer is refused with a reason.
  await page.fill('#pc_code', HALF);
  await page.selectOption('#pc_kind', 'percent');
  await page.fill('#pc_pct', '50');
  await page.click('text=Save code');
  await page.waitForTimeout(500);
  check('admin: a percent code without a store offer is refused, saying why', /needs the App Store offer code/.test(await page.textContent('#pc_msg')), await page.textContent('#pc_msg'));
  await page.fill('#pc_ios', 'HALF-50-IOS');
  await page.fill('#pc_android', 'half50');
  await page.click('text=Save code');
  await page.waitForTimeout(700);
  check('admin: with the offer ids it saves', (await page.textContent('#pc_msg')).includes(`Saved ${HALF}`));

  // A one-use code.
  await page.fill('#pc_code', ONE);
  await page.fill('#pc_max', '1');
  await page.fill('#pc_days', '7');
  await page.click('text=Save code');
  await page.waitForTimeout(700);

  const rowText = squash(await page.textContent('#pc_rows'));
  check('admin: the table lists the codes with what they give', rowText.includes(`${FREE}`) && rowText.includes('Pro free for 90 days') && rowText.includes('50% off Pro'), rowText.slice(0, 200));
  check('admin: a new code reads 0 / limit used, and live', new RegExp(`${FREE}.*?0 / 2.*?live`).test(rowText));
  check('admin: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await page.screenshot({ path: `${OUT}/admin-codes.png`, fullPage: false });
  await ctx.close();
}

// ═══ App: redeem a free code ═══
console.log('\n=== App: free code ===');
{
  const { ctx, page, installId } = await openApp('/upgrade');
  let b = await body(page);
  check('upgrade: the web build says subscriptions are coming, with no buy button that cannot work', /Subscriptions coming soon/.test(b));
  check('upgrade: a "Have a code?" entry is on the screen', /Have a code\?/.test(b));
  await page.screenshot({ path: `${OUT}/upgrade-before.png` });
  await page.getByText('Have a code?').click();
  await page.waitForTimeout(900);
  check('redeem: opens from the upgrade screen', /\/redeem/.test(page.url()), page.url());

  const input = page.getByLabel('Redeem a code').last();
  await input.fill('nosuchcode');
  await page.getByText('Redeem', { exact: true }).click();
  await page.waitForTimeout(900);
  b = await body(page);
  check('redeem: an unknown code says so plainly', /That code does not exist/.test(b));

  // Typed the way a person reads it off a poster: lower case, with a dash.
  await input.fill(`${FREE.slice(0, 3).toLowerCase()}-${FREE.slice(3).toLowerCase()}`);
  await page.getByText('Redeem', { exact: true }).click();
  await page.waitForTimeout(1500);
  b = await body(page);
  check('redeem: a free code switches Pro on and says until when', /Calgym Pro is on/.test(b) && /Enjoy it until/.test(b), b.slice(0, 300));
  check('redeem: and shows the code it used', b.includes(FREE));
  await page.screenshot({ path: `${OUT}/redeem-free.png` });
  const m = await me(installId);
  check('server: the account is Pro now, from the code', m.plan === 'pro' && m.promo?.code === FREE, JSON.stringify({ plan: m.plan, promo: m.promo }));
  const days = (new Date(m.promo.until).getTime() - Date.now()) / 86400000;
  check('server: for 90 days', days > 89.9 && days < 90.1, days.toFixed(2));
  check('server: with the Pro allowance', m.limit === 150, String(m.limit));

  await page.goto(`${APP}/upgrade`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  b = await body(page);
  check('upgrade: now says Pro, from a code, with the end date', /You're on Pro/.test(b) && /Calgym Pro from a code, until/.test(b), b.match(/You're on Pro.{0,80}/)?.[0]);
  await page.screenshot({ path: `${OUT}/upgrade-after.png` });

  // Same person, same code.
  await page.goto(`${APP}/redeem?code=${FREE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const prefilled = await page.getByLabel('Redeem a code').last().inputValue();
  check('redeem: a link with ?code= fills the box', prefilled === FREE, prefilled);
  await page.getByText('Redeem', { exact: true }).click();
  await page.waitForTimeout(900);
  b = await body(page);
  check('redeem: the same person cannot use it twice', /already used this code/.test(b));
  check('app: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ═══ App (Arabic): percent code, limit ═══
console.log('\n=== App (Arabic): percent and limits ===');
{
  const { ctx, page, installId } = await openApp('/redeem', 'ar');
  const input = page.getByLabel('استخدام رمز').last();
  await input.fill(HALF);
  await page.getByText('استخدام', { exact: true }).click();
  await page.waitForTimeout(1500);
  let b = await body(page);
  check('ar redeem: a percent code shows the discount', /خصم 50٪ على كالجيم برو/.test(b), b.slice(0, 200));
  check('ar redeem: and hands over to the store (no plan granted here)', /المتابعة إلى App Store|المتابعة إلى Google Play/.test(b));
  await page.screenshot({ path: `${OUT}/redeem-percent-ar.png` });
  const m = await me(installId);
  check('server: a percent code grants nothing by itself', m.plan === 'free' && !m.promo, m.plan);

  // The web build has no store: tapping on says so honestly.
  await page.getByText(/المتابعة إلى/).click();
  await page.waitForTimeout(800);
  b = await body(page);
  check('ar redeem: without a store on this device, it says the discount is not available here', /غير متاح على هذا الجهاز/.test(b));

  // Coming back for the same discount hands it over again, uncounted.
  await page.goto(`${APP}/redeem?code=${HALF}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText('استخدام', { exact: true }).click();
  await page.waitForTimeout(1200);
  b = await body(page);
  check('ar redeem: asking again for an unused discount shows it again', /خصم 50٪/.test(b));

  await page.goto(`${APP}/redeem?code=${ONE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText('استخدام', { exact: true }).click();
  await page.waitForTimeout(1200);
  check('ar redeem: the one-use code works for the first person', /تم تفعيل/.test(await body(page)));
  check('ar app: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page } = await openApp(`/redeem?code=${ONE}`, 'en', `u_e2e${run}second`);
  await page.getByText('Redeem', { exact: true }).click();
  await page.waitForTimeout(1200);
  check('redeem: the second person hits the one-use limit', /fully used/.test(await body(page)));
  await ctx.close();
}

// ═══ Counters ═══
console.log('\n=== Counters ===');
const list = (await adminGet('/admin/api/promos')).promos;
const row = (c) => list.find((p) => p.code === c);
check('counter: the free code shows one use, one left', row(FREE)?.redeemedCount === 1 && row(FREE)?.remaining === 1, JSON.stringify(row(FREE)));
check('counter: the percent code counted once despite two asks', row(HALF)?.redeemedCount === 1, String(row(HALF)?.redeemedCount));
check('counter: the one-use code is used up', row(ONE)?.problem === 'exhausted');
const who = (await adminGet(`/admin/api/promo-redemptions?code=${FREE}`)).redemptions;
check('counter: who used the free code is on record', who.length === 1 && who[0].ref === `u_e2e${run}en`, JSON.stringify(who));

// And the admin view of it.
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
  await page.fill('#token', 'e2e-admin');
  await page.getByRole('button', { name: /sign in|open|enter/i }).first().click();
  await page.waitForSelector('#codes', { state: 'visible' });
  await page.waitForTimeout(800);
  const rowText = squash(await page.textContent('#pc_rows'));
  check('admin: the table shows the uses', new RegExp(`${FREE}.*?1 / 2`).test(rowText) && new RegExp(`${ONE}.*?used up`).test(rowText));
  const tr = page.locator('#pc_rows tr', { hasText: FREE });
  await tr.getByText('Who').click();
  await page.waitForTimeout(700);
  check('admin: "Who" lists the person who used it', (await page.textContent('#pc_detail')).includes(`u_e2e${run}en`));
  await tr.getByText('Turn off').click();
  await page.waitForTimeout(900);
  check('admin: turning a code off shows it as off', new RegExp(`${FREE}.*?off`).test(squash(await page.textContent('#pc_rows'))));
  await page.screenshot({ path: `${OUT}/admin-after.png`, fullPage: true });
  await ctx.close();
}
{
  const { ctx, page } = await openApp(`/redeem?code=${FREE}`, 'en', `u_e2e${run}late`);
  await page.getByText('Redeem', { exact: true }).click();
  await page.waitForTimeout(1200);
  check('redeem: a code switched off stops working at once', /no longer active/.test(await body(page)));
  await ctx.close();
}

await browser.close();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
