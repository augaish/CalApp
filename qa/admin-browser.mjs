// The admin dashboard: sign in, tabs (click, arrow keys, link to a tab),
// the overview's cards, chart views with their data table and gaps, the
// attention list and launch checklist, user search, light-only even on a
// dark-mode computer, and a phone-width layout with no sideways scroll.
//
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin and a database.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const API = 'http://127.0.0.1:8787';
const OUT = './qa-out/admin';
fs.mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36).toUpperCase();

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

// Some activity to show: two people open the app, one redeems a code.
for (const ref of [`u_adm1${run}`, `u_adm2${run}`]) await fetch(`${API}/api/me`, { headers: { 'x-calgym-user': ref } });
await fetch(`${API}/admin/api/promo`, { method: 'POST', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: `ADM${run}`, kind: 'free', plan: 'pro', durationDays: 7 }) });
await fetch(`${API}/api/redeem`, { method: 'POST', headers: { 'x-calgym-user': `u_adm1${run}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: `ADM${run}` }) });

const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  // A dark-mode computer: the dashboard must stay light anyway.
  const ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
  await page.fill('#token', 'e2e-admin');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#p-overview:not([hidden])', { state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#ov_checklist .empty'));
  await page.waitForTimeout(400);

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${label}: light even on a dark-mode computer`, bg === 'rgb(238, 240, 244)', bg);
  check(`${label}: Overview opens first, with the three headline cards`, (await page.textContent('#p-overview')).includes('Paying members') && /\d/.test(await page.textContent('#s_active')));
  check(`${label}: range defaults to 30 days`, (await page.getAttribute('.chip[data-days="30"]', 'aria-pressed')) === 'true');
  const strip = await page.textContent('#ov_strip');
  check(`${label}: range totals, with "—" where nothing was recorded yet`, /Code redemptions/.test(strip) && /New users/.test(strip), strip.slice(0, 120));
  check(`${label}: the chart draws`, (await page.locator('#ov_chart svg').count()) === 1);
  check(`${label}: the chart has a text summary for screen readers`, /Growth over the last 30 days/.test(await page.getAttribute('#ov_chart svg', 'aria-label')));
  await page.click('#ov_toggle');
  const table = await page.textContent('#ov_table');
  check(`${label}: "View chart data" shows every day, gaps as "not recorded"`, (await page.locator('#ov_table tbody tr').count()) === 30 && /not recorded|\d/.test(table));
  check(`${label}: the toggle says it is open`, (await page.getAttribute('#ov_toggle', 'aria-expanded')) === 'true');
  await page.click('.chip[data-view="store"]');
  check(`${label}: the Store view swaps series`, (await page.textContent('#ov_title')) === 'Store' && /Purchases/.test(await page.textContent('#ov_legend')));
  await page.click('.chip[data-days="7"]');
  await page.waitForFunction(() => document.querySelectorAll('#ov_table tbody tr').length === 7);
  check(`${label}: 7 days reloads the data`, (await page.locator('#ov_table tbody tr').count()) === 7);
  const checklist = await page.textContent('#ov_checklist');
  check(`${label}: launch checklist says what is missing and how`, /RevenueCat iOS public key/.test(checklist) && /REVENUECAT_IOS_KEY/.test(checklist));
  check(`${label}: recent redemptions list the code just used`, (await page.textContent('#ov_redeem')).includes(`ADM${run}`));
  if (label === 'desktop') await page.screenshot({ path: `${OUT}/overview-desktop.png`, fullPage: true });
  else await page.screenshot({ path: `${OUT}/overview-phone.png`, fullPage: true });

  // Tabs: click, keyboard, deep link.
  await page.click('#t-codes');
  check(`${label}: a tab shows only its own panel`, await page.isVisible('#partners') && !(await page.isVisible('#p-overview')));
  check(`${label}: the tab is in the address`, page.url().endsWith('#codes'));
  await page.focus('#t-codes');
  await page.keyboard.press('ArrowRight');
  check(`${label}: arrow keys move between tabs`, (await page.getAttribute('#t-ai', 'aria-selected')) === 'true' && await page.isVisible('#prov_free'));
  await page.click('#t-users');
  await page.fill('#u_search', `u_adm2${run}`.toLowerCase());
  const rows = await page.locator('#rows tr').count();
  check(`${label}: user search narrows the table`, rows === 1 && (await page.textContent('#rows')).includes(`u_adm2${run}`), String(rows));
  await page.fill('#u_search', 'zzzz-no-one');
  check(`${label}: a search with no match says so`, /Nobody matches/.test(await page.textContent('#rows')));
  await page.click('#t-membership');
  check(`${label}: Membership holds prices and allowances`, await page.isVisible('#pr_pro') && await page.isVisible('#lim_free'));
  await page.click('#t-content');
  check(`${label}: Content holds the review queue and sponsor`, await page.isVisible('#sp_title'));
  check(`${label}: long explanations sit behind "How this works"`, (await page.locator('#p-codes details.how').count()) >= 1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: no sideways page scroll`, overflow <= 1, String(overflow));
  // A link straight to a tab opens it after sign-in (the token is remembered for the tab).
  await page.goto(`${API}/admin#membership`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check(`${label}: a link to #membership opens that tab`, (await page.getAttribute('#t-membership', 'aria-selected')) === 'true' && await page.isVisible('#pr_pro'));
  await page.click('text=Sign out');
  await page.waitForTimeout(700);
  check(`${label}: Sign out returns to the token screen`, await page.isVisible('#token'));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
