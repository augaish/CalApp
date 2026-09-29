// Admin → Users → "Give or remove a plan": find someone by email, pick a
// plan and a length, give it; remove it again; an email with no account
// says so and can't be given anything; "Change plan" in the table fills the
// card; a phone-width layout has no sideways scroll.
//
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin and a database.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const API = 'http://127.0.0.1:8787';
const OUT = './qa-out/admin';
fs.mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36).toLowerCase();

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

// Two signed-in people and a guest.
const A = `u_gra${run}`, B = `u_grb${run}`, G = `u_grg${run}`;
const EA = `tester.${run}@example.com`, EB = `friend.${run}@example.com`;
for (const [ref, email] of [[A, EA], [B, EB], [G, null]]) {
  await fetch(`${API}/api/me`, { headers: { 'x-calgym-user': ref } });
  if (email) await fetch(`${API}/api/identify`, { method: 'POST', headers: { 'x-calgym-user': ref, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
}
const planOf = async (ref) => (await (await fetch(`${API}/api/me`, { headers: { 'x-calgym-user': ref } })).json());

const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
  await page.fill('#token', 'e2e-admin');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#p-overview:not([hidden])', { state: 'visible' });
  await page.click('#t-users');
  await page.waitForSelector('#grant', { state: 'visible' });

  const firstCard = await page.evaluate(() => document.querySelector('#p-users .card').id);
  check(`${label}: the plan card is first on Users`, firstCard === 'grant', firstCard);
  check(`${label}: nothing to give before an email`, await page.isDisabled('#g_give') && await page.isDisabled('#g_remove'));

  // Unknown email.
  await page.fill('#g_who', `nobody.${run}@example.com`);
  await page.click('[data-gplan="pro"]');
  check(`${label}: unknown email says they must sign up first`, /sign up in the app first/.test(await page.textContent('#g_found')));
  check(`${label}: unknown email can't be given a plan`, await page.isDisabled('#g_give'));

  // Give Pro+ for 3 months, typed in a different case.
  await page.fill('#g_who', EA.toUpperCase());
  check(`${label}: a known email is found, case aside`, (await page.textContent('#g_found')).includes(EA) && /now Free/.test(await page.textContent('#g_found')), await page.textContent('#g_found'));
  await page.click('[data-gplan="proPlus"]');
  await page.click('[data-glen="90"]');
  check(`${label}: the button says what it will do`, (await page.textContent('#g_give')).trim() === 'Give Pro+ for 3 months', await page.textContent('#g_give'));
  await page.fill('#g_note', 'beta tester');
  await page.click('#g_give');
  await page.waitForSelector('#g_msg.good');
  const msg = await page.textContent('#g_msg');
  check(`${label}: a clear confirmation with the end date`, /now has Pro\+ until \w/.test(msg) && !/Invalid/.test(msg), msg);
  const a1 = await planOf(A);
  const days = Math.round((new Date(a1.planUntil ?? a1.until ?? 0).getTime() - Date.now()) / 86400000);
  check(`${label}: the account really has Pro+ for ~90 days`, a1.plan === 'proPlus' && (isNaN(days) || (days >= 89 && days <= 90)), JSON.stringify(a1).slice(0, 160));
  await page.waitForFunction((e) => document.querySelector('#g_found').textContent.includes('now Pro+'), EA);
  check(`${label}: the card now shows the new plan and Remove`, /given here, until \w/.test(await page.textContent('#g_found')) && (await page.textContent('#g_remove')).trim() === 'Remove Pro+' && !(await page.isDisabled('#g_remove')));

  // Remove.
  await page.click('#g_remove');
  await page.waitForFunction(() => /back on Free/.test(document.querySelector('#g_msg').textContent));
  check(`${label}: removing puts them back on Free`, (await planOf(A)).plan === 'free');

  // Essentials · Training forever, from the table's Change plan button.
  await page.fill('#u_search', EB);
  await page.click('#rows button:has-text("Change plan")');
  check(`${label}: Change plan fills the card with their email`, (await page.inputValue('#g_who')) === EB);
  await page.click('[data-gplan="essentials:training"]');
  await page.click('[data-glen="0"]');
  check(`${label}: Forever reads as forever`, (await page.textContent('#g_give')).trim() === 'Give Essentials · Training forever');
  await page.click('#g_give');
  await page.waitForFunction(() => /no end date/.test(document.querySelector('#g_msg').textContent));
  const b1 = await planOf(B);
  check(`${label}: Essentials · Training was set`, b1.plan === 'essentials' && b1.module === 'training', JSON.stringify(b1).slice(0, 160));
  await page.click('#g_remove');
  await page.waitForFunction(() => /back on Free/.test(document.querySelector('#g_msg').textContent));

  // A guest, by ref; a custom number of days.
  await page.fill('#g_who', G);
  check(`${label}: a guest can be found by ref`, (await page.textContent('#g_found')).includes(G));
  await page.click('[data-gplan="pro"]');
  await page.click('[data-glen="custom"]');
  check(`${label}: Other asks for days first`, await page.isDisabled('#g_give'));
  await page.fill('#g_days', '14');
  check(`${label}: custom days in the label`, (await page.textContent('#g_give')).trim() === 'Give Pro for 14 days');
  await page.click('#g_give');
  await page.waitForFunction(() => /now has Pro until/.test(document.querySelector('#g_msg').textContent));
  check(`${label}: the guest has Pro`, (await planOf(G)).plan === 'pro');
  await page.click('#g_remove');
  await page.waitForFunction(() => /back on Free/.test(document.querySelector('#g_msg').textContent));

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: no sideways scroll`, wide <= 0, String(wide));
  await page.locator('#grant').screenshot({ path: `${OUT}/grant-${label}.png` });
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// The API: by email, and an unknown email.
const r1 = await fetch(`${API}/admin/api/plan`, { method: 'POST', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `nobody.${run}@example.com`, plan: 'pro' }) });
check('api: unknown email → 404 no_account', r1.status === 404 && (await r1.json()).error === 'no_account');
const r2 = await fetch(`${API}/admin/api/plan`, { method: 'POST', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EB, plan: 'pro', days: 7 }) });
const j2 = await r2.json();
check('api: by email grants that account', r2.ok && j2.refs?.includes(B) && (await planOf(B)).plan === 'pro', JSON.stringify(j2).slice(0, 160));
await fetch(`${API}/admin/api/plan`, { method: 'POST', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EB, plan: 'free' }) });

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
