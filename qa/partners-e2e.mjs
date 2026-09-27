// Partner codes end to end on a real Postgres: X brings Z, Z brings W; a
// buyer uses W's code; store webhooks pay W, Z and X their shares; retries,
// terms, refunds and payouts behave; the partner page shows it; the admin
// console builds the chain and never loses it on "Turn off".
//
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin,
// REVENUECAT_WEBHOOK_SECRET=e2e-hook and a database.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const API = 'http://127.0.0.1:8787';
const OUT = './qa-out/partners';
fs.mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36).toUpperCase();
const X = `X${run}`, Z = `Z${run}`, W = `W${run}`;

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const admin = (path, body) => fetch(`${API}${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const redeem = (ref, code) => fetch(`${API}/api/redeem`, {
  method: 'POST', headers: { 'x-calgym-user': ref, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
}).then(async (r) => ({ status: r.status, ...(await r.json()) }));
let evt = 0;
const hook = (event) => fetch(`${API}/api/billing/revenuecat`, {
  method: 'POST', headers: { authorization: 'e2e-hook', 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: { id: `ev_${run}_${++evt}`, environment: 'PRODUCTION', product_id: 'calgym_pro_monthly', entitlement_ids: ['pro'],
    expiration_at_ms: Date.now() + 30 * 86400000, event_timestamp_ms: Date.now() + evt, ...event } }),
}).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const report = (id) => admin(`/admin/api/partner-report?id=${id}`);
const partnerById = async (id) => (await admin('/admin/api/partners')).partners.find((p) => p.id === id);

// ═══ Partners and the chain ═══
const px = (await admin('/admin/api/partner', { name: `Xavier ${run}`, contact: 'x@example.com' })).partner;
const pz = (await admin('/admin/api/partner', { name: `Zaid ${run}` })).partner;
const pw = (await admin('/admin/api/partner', { name: `Wafa ${run}` })).partner;
check('partners are created with private links', px?.id && px.token?.length > 16 && pz?.id && pw?.id);
check('a partner needs a name', (await admin('/admin/api/partner', { name: '' })).error === 'name_required');

const fx = await admin('/admin/api/promo', { code: X, kind: 'free', plan: 'pro', durationDays: 7, partnerId: px.id, commissionPct: 20 });
const fz = await admin('/admin/api/promo', { code: Z, kind: 'free', plan: 'pro', durationDays: 7, partnerId: pz.id, commissionPct: 15, parentCode: X, parentPct: 5 });
const fw = await admin('/admin/api/promo', {
  code: W, kind: 'percent', plan: 'pro', percentOff: 20, offerIos: `${W}IOS`, partnerId: pw.id, commissionPct: 10,
  term: 'months', termMonths: 1, parentCode: Z, parentPct: 5, grandparentPct: 2,
});
check('codes save with owners, shares and links', fx.ok && fz.ok && fw.ok, JSON.stringify([fx.error, fz.error, fw.error]));
check('W\'s code: 10% to Wafa, 5% up to Zaid, 2% up to Xavier, for one month',
  JSON.stringify(fw.promo?.earning) === JSON.stringify({ partnerId: pw.id, commissionPct: 10, term: 'months', termMonths: 1, parentCode: Z, parentPct: 5, grandparentPct: 2 }), JSON.stringify(fw.promo?.earning));
check('refused: a loop (X linked under W)', (await admin('/admin/api/promo', { code: X, kind: 'free', plan: 'pro', durationDays: 7, partnerId: px.id, commissionPct: 20, parentCode: Z, parentPct: 1 })).error === 'link_loop');
check('refused: shares over 100%', (await admin('/admin/api/promo', { code: W, kind: 'percent', plan: 'pro', percentOff: 20, offerIos: 'a', partnerId: pw.id, commissionPct: 95, parentCode: Z, parentPct: 5, grandparentPct: 2 })).error === 'shares_over_100');

// ═══ A buyer through W's code ═══
const buyer = `u_buyer${run}`;
const r1 = await redeem(buyer, W.toLowerCase());
check('the buyer redeems W\'s code (the store offer comes back)', r1.ok && r1.kind === 'percent' && r1.percentOff === 20, JSON.stringify(r1));
await redeem(buyer, X); // a later code must not take the buyer over
const sale = await hook({ type: 'INITIAL_PURCHASE', app_user_id: buyer, price: 10, commission_percentage: 0.15, tax_percentage: 0.1, transaction_id: `t1${run}`, original_transaction_id: `o1${run}`, purchased_at_ms: Date.now() });
check('the webhook still grants the plan', sale.ok && sale.result === 'grant', JSON.stringify(sale));
let rw = await report(pw.id), rz = await report(pz.id), rx = await report(px.id);
check('$10 sale, $7.50 net: Wafa earns $0.75', rw.balance.earned === 0.75, JSON.stringify(rw.balance));
check('Zaid earns $0.38 (5%, one level up)', rz.balance.earned === 0.38, JSON.stringify(rz.balance));
check('Xavier earns $0.15 (2%, two levels up)', rx.balance.earned === 0.15, JSON.stringify(rx.balance));
check('first come, first served: the later X code did not take the buyer', rx.byLevel.every((l) => l.level === 2), JSON.stringify(rx.byLevel));
check('fresh earnings are pending, nothing owed yet', rw.balance.pending === 0.75 && rw.balance.owed === 0);

// The same delivery again, and the same transaction under a new event id.
await fetch(`${API}/api/billing/revenuecat`, { method: 'POST', headers: { authorization: 'e2e-hook', 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: { id: `ev_${run}_${evt}`, type: 'INITIAL_PURCHASE', app_user_id: buyer, price: 10, transaction_id: `t1${run}` } }) });
await hook({ type: 'INITIAL_PURCHASE', app_user_id: buyer, price: 10, commission_percentage: 0.15, tax_percentage: 0.1, transaction_id: `t1${run}` });
rw = await report(pw.id);
check('retries never count a sale twice', rw.balance.earned === 0.75 && rw.recent.length === 1, JSON.stringify(rw.balance));

// A renewal inside the one-month term earns; one after it does not.
await hook({ type: 'RENEWAL', app_user_id: buyer, price: 10, commission_percentage: 0.15, tax_percentage: 0.1, transaction_id: `t2${run}`, original_transaction_id: `o1${run}`, purchased_at_ms: Date.now() + 20 * 86400000 });
await hook({ type: 'RENEWAL', app_user_id: buyer, price: 10, commission_percentage: 0.15, tax_percentage: 0.1, transaction_id: `t3${run}`, original_transaction_id: `o1${run}`, purchased_at_ms: Date.now() + 40 * 86400000 });
rw = await report(pw.id);
check('a renewal inside the term earns, one after it does not', rw.balance.earned === 1.5 && rw.codes[0].sales === 2, JSON.stringify({ b: rw.balance, sales: rw.codes[0]?.sales }));

// A refund of the first payment reverses exactly its shares.
const ref1 = await hook({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', app_user_id: buyer, price: -10, transaction_id: `t1${run}`, original_transaction_id: `o1${run}` });
check('a refund is accepted by the webhook', ref1.ok, JSON.stringify(ref1));
rw = await report(pw.id); rz = await report(pz.id); rx = await report(px.id);
check('refund: Wafa back to $0.75, Zaid to $0.38, Xavier to $0.15', rw.balance.earned === 0.75 && rz.balance.earned === 0.38 && rx.balance.earned === 0.15,
  JSON.stringify([rw.balance.earned, rz.balance.earned, rx.balance.earned]));
check('the refund shows as its own line', rw.recent.some((l) => l.kind === 'refund' && l.amountUsd === -0.75));
await hook({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', app_user_id: buyer, price: -10, transaction_id: `t1${run}` });
check('a repeated refund is not reversed twice', (await report(pw.id)).balance.earned === 0.75);
check('turning renewal off is not a refund', (await hook({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', app_user_id: buyer, price: 0, transaction_id: `t2${run}` })).ok && (await report(pw.id)).balance.earned === 0.75);

// ═══ Someone who typed the offer code in the App Store, never in the app ═══
const direct = `u_direct${run}`;
await hook({ type: 'INITIAL_PURCHASE', app_user_id: direct, price: 10, commission_percentage: 0.15, tax_percentage: 0, transaction_id: `t9${run}`, offer_code: `${W}IOS` });
check('a purchase with the store offer code is credited to that code', (await report(pw.id)).codes[0].buyers === 2);
const nobody = `u_nobody${run}`;
const before = (await report(pw.id)).balance.earned;
await hook({ type: 'INITIAL_PURCHASE', app_user_id: nobody, price: 10, transaction_id: `t10${run}` });
check('a purchase with no code pays nobody', (await report(pw.id)).balance.earned === before);
const sandboxBefore = (await report(pw.id)).balance.earned;
await hook({ type: 'INITIAL_PURCHASE', environment: 'SANDBOX', app_user_id: `u_sb${run}`, price: 10, transaction_id: `t11${run}`, offer_code: `${W}IOS` });
check('test (sandbox) purchases pay nobody', (await report(pw.id)).balance.earned === sandboxBefore);

// ═══ Payouts and deleting ═══
check('a payout must be above zero', (await admin('/admin/api/partner-payout', { id: pw.id, amountUsd: 0 })).error === 'amount_out_of_range');
check('a payout is recorded', (await admin('/admin/api/partner-payout', { id: pw.id, amountUsd: 1, note: 'bank ref 42' })).ok);
const wNow = await partnerById(pw.id);
check('paid shows, owed never goes below zero', wNow.balance.paid === 1 && wNow.balance.owed === 0, JSON.stringify(wNow.balance));
check('a code with earnings cannot be deleted', (await admin('/admin/api/promo-delete', { code: W })).error === 'has_earnings');
check('a partner with earnings cannot be deleted', (await admin('/admin/api/partner-delete', { id: pw.id })).error === 'has_earnings');
const spare = (await admin('/admin/api/partner', { name: `Spare ${run}` })).partner;
check('a partner with no earnings can be deleted', (await admin('/admin/api/partner-delete', { id: spare.id })).ok);

// ═══ The partner's own page ═══
const browser = await chromium.launch();
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const res = await page.goto(`${API}/partner/${pw.token}`);
  const text = (await page.textContent('body')).replace(/\s+/g, ' ');
  check('partner page: opens by the private link', res.status() === 200 && text.includes(`Wafa ${run}`));
  check('partner page: totals, codes, levels, payments, payouts', /Earned in total/.test(text) && text.includes(W) && /Recent payments/.test(text) && /bank ref 42/.test(text) && /refund/.test(text));
  check('partner page: never names a buyer', !text.includes(buyer) && !text.includes(direct));
  check('partner page: kept out of search engines', (res.headers()['x-robots-tag'] ?? '').includes('noindex'));
  await page.screenshot({ path: `${OUT}/partner-page.png`, fullPage: true });
  const zPage = await (await fetch(`${API}/partner/${pz.token}`)).text();
  check('Zaid\'s page shows what came from partners he brought', /Partners you brought/.test(zPage));
  const bad = await page.goto(`${API}/partner/not-a-real-token`);
  check('a wrong link shows nothing', bad.status() === 404);
  const rotated = (await admin('/admin/api/partner-token', { id: pw.id })).partner;
  check('a new link replaces the old one', rotated.token !== pw.token && (await fetch(`${API}/partner/${pw.token}`)).status === 404 && (await fetch(`${API}/partner/${rotated.token}`)).status === 200);
  await ctx.close();
}

// ═══ Admin console ═══
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
  await page.fill('#token', 'e2e-admin');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForSelector('#app:not(.hide)');
  await page.click('#t-codes');
  await page.waitForSelector('#partners', { state: 'visible' });
  await page.waitForTimeout(800);
  const ptText = (await page.textContent('#pt_rows')).replace(/\s+/g, ' ');
  check('admin: partners listed with their money', ptText.includes(`Wafa ${run}`) && ptText.includes('$1.00'), ptText.slice(0, 160));

  // Build a new partner and a linked code through the form.
  await page.fill('#pt_name', `Nora ${run}`);
  await page.click('text=Save partner');
  await page.waitForTimeout(700);
  const N = `N${run}`;
  await page.fill('#pc_code', N);
  const nora = (await admin('/admin/api/partners')).partners.find((p) => p.name === `Nora ${run}`);
  await page.selectOption('#pc_partner', nora.id);
  await page.fill('#pc_comm', '12');
  await page.selectOption('#pc_term', 'months');
  await page.fill('#pc_months', '6');
  await page.selectOption('#pc_parent', W);
  check('admin: the "two levels up" share appears for a code linked under a linked code', await page.isVisible('#pc_gpct') && /Zaid/.test(await page.textContent('#pc_glabel')), await page.textContent('#pc_glabel'));
  await page.fill('#pc_ppct', '4');
  await page.fill('#pc_gpct', '1');
  await page.click('text=Save code');
  await page.waitForTimeout(800);
  const saved = (await admin('/admin/api/promos')).promos.find((p) => p.code === N);
  check('admin: the form saves the owner, term and chain', JSON.stringify(saved?.earning) === JSON.stringify({ partnerId: nora.id, commissionPct: 12, term: 'months', termMonths: 6, parentCode: W, parentPct: 4, grandparentPct: 1 }), JSON.stringify(saved?.earning));

  // "Turn off" must keep the earning set-up.
  const row = page.locator('#pc_rows tr', { hasText: N });
  await row.getByRole('button', { name: 'Turn off' }).click();
  await page.waitForTimeout(800);
  const off = (await admin('/admin/api/promos')).promos.find((p) => p.code === N);
  check('admin: turning a code off keeps who it pays', off.active === false && JSON.stringify(off.earning) === JSON.stringify(saved.earning), JSON.stringify(off.earning));
  const rowText = (await page.locator('#pc_rows tr', { hasText: W }).first().textContent()).replace(/\s+/g, ' ');
  check('admin: the code row shows who earns and what it brought in', rowText.includes(`Wafa ${run}`) && /buyer/.test(rowText), rowText.slice(0, 200));
  check('admin: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await page.screenshot({ path: `${OUT}/admin.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
