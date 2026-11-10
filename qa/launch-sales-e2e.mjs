// Launch figures and money per code, end to end: store events arrive by the
// RevenueCat webhook, and admin → Overview → Launch and the codes table show
// trials, paying members, store money and what each code brought in — with
// test (sandbox) purchases, refunds and repeats handled.
//
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin,
// REVENUECAT_WEBHOOK_SECRET=e2e-hook and a database.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const API = 'http://127.0.0.1:8787';
const run = Date.now().toString(36).toUpperCase();
const CODE = `DISC${run}`;
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const admin = (path, body) =>
  fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const hook = (event) =>
  fetch(`${API}/api/billing/revenuecat`, { method: 'POST', headers: { authorization: 'e2e-hook', 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) }).then((r) => r.json());

const now = Date.now();
const DAY = 86400000;
const A = `u_ls_a_${run}`, B = `u_ls_b_${run}`, C = `u_ls_c_${run}`;
const base = (id, ref, extra) => ({ id: `${id}_${run}`, app_user_id: ref, product_id: 'calgym_pro_monthly', entitlement_ids: ['pro'], environment: 'PRODUCTION', store: 'APP_STORE', event_timestamp_ms: now, ...extra });

const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
check('set launch day', (await admin('/admin/api/launch-day', { day })).day === day);
check('a bad day is refused', (await admin('/admin/api/launch-day', { day: '2026-13-45' })).error === 'invalid_day');
const before = (await admin('/admin/api/overview?days=30')).launch;
const statsBefore = (await admin('/admin/api/data')).stats;

check('code created', (await admin('/admin/api/promo', { code: CODE, kind: 'percent', plan: 'pro', percentOff: 30, offerIos: CODE, offerAndroid: CODE.toLowerCase(), active: true })).ok === true);

// A: a trial that ended, then the first paid month through the code's App Store offer.
await hook(base('a1', A, { type: 'INITIAL_PURCHASE', period_type: 'TRIAL', price: 0, transaction_id: `ta1_${run}`, purchased_at_ms: now - 15 * DAY, expiration_at_ms: now - DAY }));
const sale = await hook(base('a2', A, { type: 'RENEWAL', period_type: 'NORMAL', price: 24.99, offer_code: CODE, transaction_id: `ta2_${run}`, original_transaction_id: `ta1_${run}`, purchased_at_ms: now, expiration_at_ms: now + 30 * DAY }));
check('the paid month is applied', sale.result === 'grant', JSON.stringify(sale));
// B: buys with the code, then is refunded.
await hook(base('b1', B, { type: 'INITIAL_PURCHASE', period_type: 'NORMAL', price: 9.99, offer_code: CODE.toLowerCase(), store: 'PLAY_STORE', transaction_id: `tb1_${run}`, purchased_at_ms: now, expiration_at_ms: now + 30 * DAY }));
await hook(base('b2', B, { type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', price: -9.99, transaction_id: `tb1_${run}`, expiration_at_ms: now - 1000 }));
// The plan itself ends when the store's expiration arrives, as RevenueCat sends it after a refund.
await hook(base('b3', B, { type: 'EXPIRATION', transaction_id: `tb1_${run}`, expiration_at_ms: now - 500, event_timestamp_ms: now + 1000 }));
// C: a TestFlight (sandbox) purchase with the code: never money, never paying.
await hook(base('c1', C, { type: 'INITIAL_PURCHASE', period_type: 'NORMAL', price: 24.99, offer_code: CODE, environment: 'SANDBOX', transaction_id: `tc1_${run}`, purchased_at_ms: now, expiration_at_ms: now + 30 * DAY }));
// A repeat delivery changes nothing.
check('a repeat is ignored', (await hook(base('a2', A, { type: 'RENEWAL', price: 24.99, offer_code: CODE, transaction_id: `ta2_${run}` }))).result === 'duplicate');

const promo = (await admin('/admin/api/promos')).promos.find((p) => p.code === CODE);
// 24.99 × 0.85 (estimated store fee) = 21.24; B's 8.49 was refunded; C was a test.
check('brought in: the paid month only', Math.abs(promo.broughtUsd - 21.24) < 0.01, String(promo.broughtUsd));
check('two people paid through it (one later refunded)', promo.buyers === 2, String(promo.buyers));

const after = (await admin('/admin/api/overview?days=30')).launch;
check('launch day is returned', after.day === day);
check('three new accounts since launch', after.since.users - before.since.users === 3, `${before.since.users} → ${after.since.users}`);
check('A counts as paying since launch', after.since.paying - before.since.paying === 1, `${before.since.paying} → ${after.since.paying}`);
check('store money since launch: 21.24', Math.abs(after.since.revenueUsd - before.since.revenueUsd - 21.24) < 0.01, `${before.since.revenueUsd} → ${after.since.revenueUsd}`);
check('the ended trial converted', after.trialsEnded - before.trialsEnded === 1 && after.trialsConverted - before.trialsConverted === 1);
const statsAfter = (await admin('/admin/api/data')).stats;
check('Paying members: +1 (the test purchase is not counted)', statsAfter.payingUsers - statsBefore.payingUsers === 1, `${statsBefore.payingUsers} → ${statsAfter.payingUsers}`);

// The admin page
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
await ctx.addInitScript(() => sessionStorage.setItem('ct', 'e2e-admin'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const launchText = await page.textContent('#launch');
check('Launch card: live, both columns', /Live since|Launch day/.test(launchText) && launchText.includes('Before launch') && launchText.includes('Since launch') && launchText.includes('Store money'));
await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}-overview.png` : '/tmp/launch-overview.png' });
await page.click('#t-codes');
await page.waitForTimeout(800);
const row = await page.locator('#pc_rows tr', { hasText: CODE }).textContent();
check('codes table: Brought in 80 SAR', row.includes('80 SAR'), row);
check('codes table: a total row', /All codes/.test(await page.textContent('#pc_total')));
await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}-codes.png` : '/tmp/launch-codes.png', fullPage: false });
// Clearing the day puts everyone back to "before".
await admin('/admin/api/launch-day', { day: null });
const cleared = (await admin('/admin/api/overview?days=30')).launch;
check('cleared: not launched, everyone before', cleared.day === null && cleared.since.users === 0);
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
