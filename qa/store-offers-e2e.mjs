// Codes made in the stores from admin, end to end against stand-in stores
// (qa/fakes/stores-fake.mjs) that check tokens and bodies the way App Store
// Connect and the Play Developer API do: connect, test, make a discount code
// (Google refuses once, then Retry), a free code, a check, and a retry that
// must not make a second offer.
//
// Needs: Postgres as for the other e2e suites (DATABASE_URL below). Starts its
// own server on :8788 and the stand-in stores on :8796.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { generateKeyPairSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'http://127.0.0.1:8788';
const FAKE = 'http://127.0.0.1:8796';
const DB = process.env.DATABASE_URL || 'postgresql://postgres@localhost/calgym?host=/opt/calgym-pg/pgsock&port=5433';
const run = Date.now().toString(36).toUpperCase();
const DISC = `AHMED${run}`;
const FREE = `GYM${run}`;
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

// Keys of the shape each store issues: an EC P-256 .p8 (Apple), an RSA service account (Google).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stores-'));
const apple = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.writeFileSync(path.join(dir, 'apple.pub'), apple.publicKey.export({ type: 'spki', format: 'pem' }));
fs.writeFileSync(path.join(dir, 'google.pub'), google.publicKey.export({ type: 'spki', format: 'pem' }));
const p8 = apple.privateKey.export({ type: 'pkcs8', format: 'pem' });
const sa = { type: 'service_account', client_email: 'calgym-codes@test.iam.gserviceaccount.com', private_key: google.privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `${FAKE}/token` };

const kids = [];
const start = (cmd, args, opts) => { const c = spawn(cmd, args, { stdio: 'ignore', detached: true, ...opts }); kids.push(c); return c; };
const waitFor = async (url) => { for (let i = 0; i < 80; i++) { try { await fetch(url); return; } catch {} await new Promise((r) => setTimeout(r, 400)); } throw new Error(`${url} did not start`); };
start('node', ['qa/fakes/stores-fake.mjs', '8796', path.join(dir, 'apple.pub'), path.join(dir, 'google.pub')], { cwd: '/home/user/CalApp' });
await waitFor(`${FAKE}/__log`);
const env = {
  ...process.env, DATABASE_URL: DB, PORT: '8788', ADMIN_TOKEN: 'e2e-admin', REVENUECAT_WEBHOOK_SECRET: 'e2e-hook', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:8799',
  ASC_KEY_ID: 'TESTKEY123', ASC_ISSUER_ID: '00000000-aaaa-bbbb-cccc-000000000000',
  // The way a .p8 often lands in a Railway variable: on one line with \n.
  ASC_PRIVATE_KEY: p8.replace(/\n/g, '\\n'), ASC_BASE_URL: FAKE,
  GOOGLE_PLAY_SERVICE_ACCOUNT: JSON.stringify(sa), GOOGLE_PLAY_BASE_URL: FAKE,
};
delete env.DEEPSEEK_API_KEY;
start('npx', ['tsx', 'src/index.ts'], { cwd: '/home/user/CalApp/server', env });
await waitFor(`${API}/health`);

const admin = (p, body) => fetch(`${API}${p}`, { method: body ? 'POST' : 'GET', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const fakeLog = () => fetch(`${FAKE}/__log`).then((r) => r.json());

try {
  const conn = await admin('/admin/api/store-connections?test=1');
  check('Apple connects (signed token accepted)', conn.apple.test?.ok === true && /3 subscriptions/.test(conn.apple.test.detail), JSON.stringify(conn.apple));
  check('Google connects (service account sign-in)', conn.google.test?.ok === true, JSON.stringify(conn.google));

  // ── The admin page ──
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  await ctx.addInitScript(() => sessionStorage.setItem('ct', 'e2e-admin'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${API}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('#t-codes');
  await page.waitForTimeout(600);
  check('Store connections card: both keys set', /App Store Connect · key set/.test(await page.textContent('#sc_list')) && /Google Play · key set/.test(await page.textContent('#sc_list')));
  await page.getByRole('button', { name: 'Test connections' }).click();
  await page.waitForTimeout(1500);
  check('Test connections: both connected', (await page.textContent('#sc_list')).match(/connected · /g)?.length === 2, await page.textContent('#sc_list'));

  // A discount: 30% off Pro monthly for 3 months.
  await page.fill('#pc_code', DISC);
  await page.selectOption('#pc_kind', 'percent');
  await page.fill('#pc_pct', '30');
  check('the make-for-me step shows, typed names hidden', await page.isVisible('#pc_make') && !(await page.isVisible('#pc_manual')));
  await page.selectOption('#pc_periods', '3');
  const price = await page.textContent('#pc_price');
  check('price preview: SAR 24.99 → about SAR 17.49 for 3 months', /24\.99 → about SAR 17\.49 a month for 3 months/.test(price), price);
  check('the summary does not ask for offer names', !/until you add/.test(await page.textContent('#pc_summary')));
  await page.getByRole('button', { name: 'Save code' }).click();
  await page.waitForTimeout(2500);
  let msg = await page.textContent('#pc_msg');
  check('saved; Apple ✓, Google refused once', msg.includes(`${DISC} is saved; a store needs another try`) && /App Store:.*offer/.test(msg) && /Google Play:.*permission/.test(msg), msg);

  let log = await fakeLog();
  const offer = log.appleOffers.find((o) => o.attributes.name === DISC);
  check('Apple offer: pay as you go, 1 month × 3, new, current members and lapsed', offer && offer.attributes.offerMode === 'PAY_AS_YOU_GO' && offer.attributes.duration === 'ONE_MONTH' && offer.attributes.numberOfPeriods === 3 && offer.attributes.customerEligibilities.join() === 'NEW,EXISTING,EXPIRED' && offer.attributes.offerEligibility === 'STACK_WITH_INTRO_OFFERS', JSON.stringify(offer?.attributes));
  const sau = offer?.prices.find((p) => p.relationships.territory.data.id === 'SAU');
  check('Apple price: the Saudi step nearest 17.49, found on page 2', sau?.relationships.subscriptionPricePoint.data.id === 'pp-sau-1749', sau?.relationships.subscriptionPricePoint.data.id);
  check('Apple price: equalized in the other countries', ['USA', 'ARE', 'GBR'].every((t) => offer.prices.some((p) => p.relationships.territory.data.id === t && p.relationships.subscriptionPricePoint.data.id === `pp-sau-1749-${t}`)));
  const custom = log.appleCustom.find((c) => c.attributes.customCode === DISC);
  check('Apple custom code with the same name', custom && custom.attributes.numberOfCodes === 10000);

  // Retry Google from the Stores column.
  await page.locator('#pc_rows tr', { hasText: DISC }).getByRole('button', { name: 'Retry' }).click();
  await page.waitForTimeout(2000);
  msg = await page.textContent('#pc_msg');
  check('Retry: Google ✓', /Google Play · .*✓ offer/.test(msg), msg);
  log = await fakeLog();
  const g = log.playOffers.find((o) => o.offerId === DISC.toLowerCase());
  check('Google offer: active, monthly base plan, 30% for 3 months in every region', g && g.state === 'ACTIVE' && g.basePlanId === 'monthly' && g.phases[0].duration === 'P1M' && g.phases[0].recurrenceCount === 3 && g.phases[0].regionalConfigs.every((r) => r.relativeDiscount === 0.3) && g.phases[0].otherRegionsConfig?.relativeDiscount === 0.3, JSON.stringify(g?.phases));
  const row = await page.locator('#pc_rows tr', { hasText: DISC }).textContent();
  check('Stores column: ✓ Apple ✓ Google', /✓ Apple/.test(row) && /✓ Google/.test(row), row);
  const promo = (await admin('/admin/api/promos')).promos.find((p) => p.code === DISC);
  check('the code points at both offers', promo.offerIos === DISC && promo.offerAndroid === DISC.toLowerCase(), `${promo.offerIos} / ${promo.offerAndroid}`);

  // A free month on the yearly plan's store offer would be odd; a free month on monthly:
  await page.fill('#pc_code', FREE);
  await page.selectOption('#pc_kind', 'free');
  await page.fill('#pc_days', '30');
  await page.getByRole('button', { name: 'Save code' }).click();
  await page.waitForTimeout(2500);
  msg = await page.textContent('#pc_msg');
  check('free code: ready in both stores', msg.includes(`${FREE} is ready`), msg);
  log = await fakeLog();
  const fo = log.appleOffers.find((o) => o.attributes.name === FREE);
  check('Apple free offer: 1 month free after the trial, members too, no price points', fo && fo.attributes.offerMode === 'FREE_TRIAL' && fo.attributes.duration === 'ONE_MONTH' && fo.attributes.offerEligibility === 'STACK_WITH_INTRO_OFFERS' && fo.attributes.customerEligibilities.join() === 'NEW,EXISTING,EXPIRED' && fo.prices.every((p) => !p.relationships.subscriptionPricePoint));
  const gf = log.playOffers.find((o) => o.offerId === FREE.toLowerCase());
  check('Google free offer: the 14-day trial plus a free month (P44D)', gf && gf.phases[0].duration === 'P44D' && gf.phases[0].regionalConfigs.every((r) => r.free && !r.relativeDiscount));

  // A code for 5 people: Apple refuses so few, so the smallest it takes.
  const FEW = `FEW${run}`;
  await admin('/admin/api/promo', { code: FEW, kind: 'free', plan: 'pro', durationDays: 30, maxRedemptions: 5, active: true, stores: { create: true, productId: 'calgym_pro_monthly', periods: 1 } }).then((r) => {
    const apple = (r.stores ?? []).find((x) => x.store === 'apple');
    check('5 uses: Apple refuses, the smallest it takes is used and named', apple?.ok === true && /smallest limit is 10 uses|smallest limit is 100 uses/.test(apple.detail), JSON.stringify(r.stores ?? r));
  });
  const few = (await fakeLog()).appleCustom.find((c) => c.attributes.customCode === FEW);
  check('  the custom code holds 100 uses', few?.attributes.numberOfCodes === 100, JSON.stringify(few?.attributes));

  // A code for 2 people, saved from the page: asked whether to turn Apple's code off after 2.
  const TWO = `TWO${run}`;
  await page.fill('#pc_code', TWO);
  await page.selectOption('#pc_kind', 'free');
  await page.fill('#pc_days', '30');
  await page.fill('#pc_max', '2');
  await page.getByRole('button', { name: 'Save code' }).click();
  await page.waitForTimeout(2500);
  const ask = await page.textContent('#pc_hardstop').catch(() => '');
  check('limit 2: asked to turn the Apple code off after 2 uses', /smallest limit Apple accepts is 100 uses/.test(ask) && /after 2 uses/.test(ask), ask);
  await page.locator('#pc_hardstop').getByRole('button', { name: 'Yes' }).click();
  await page.waitForTimeout(800);
  check('  Yes: confirmed, none used yet', /turns off after 2 uses \(0 used so far\)/.test(await page.textContent('#pc_hardstop')), await page.textContent('#pc_hardstop'));
  check('  the Stores column says so', /off after 2/.test(await page.locator('#pc_rows tr', { hasText: TWO }).textContent()));
  // Use 1: Android, through the redeem screen. Use 2: Apple's own sheet, seen in the store event.
  await fetch(`${API}/api/redeem`, { method: 'POST', headers: { 'x-calgym-user': `u_two_a_${run}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: TWO, platform: 'android' }) });
  const customTwo = () => fakeLog().then((l) => l.appleCustom.find((c) => c.attributes.customCode === TWO));
  check('  after 1 use the Apple code is still on', (await customTwo())?.attributes.active !== false);
  await fetch(`${API}/api/billing/revenuecat`, { method: 'POST', headers: { authorization: 'e2e-hook', 'Content-Type': 'application/json' }, body: JSON.stringify({ event: { id: `ev_two_${run}`, type: 'INITIAL_PURCHASE', app_user_id: `u_two_b_${run}`, product_id: 'calgym_pro_monthly', entitlement_ids: ['pro'], period_type: 'TRIAL', price: 0, offer_code: TWO, store: 'APP_STORE', environment: 'PRODUCTION', transaction_id: `t_two_${run}`, purchased_at_ms: Date.now(), expiration_at_ms: Date.now() + 44 * 86400000, event_timestamp_ms: Date.now() } }) });
  check('  after the 2nd use (in Apple\'s sheet) the Apple code is turned off', (await customTwo())?.attributes.active === false, JSON.stringify((await customTwo())?.attributes));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#t-codes');
  await page.waitForTimeout(800);
  check('  the Stores column: off (limit reached)', /off \(limit reached\)/.test(await page.locator('#pc_rows tr', { hasText: TWO }).textContent()));

  // A code made before the use count was kept: Check reads it back from Apple and asks.
  const OLD = `OLD${run}`;
  await admin('/admin/api/promo', { code: OLD, kind: 'free', plan: 'pro', durationDays: 30, maxRedemptions: 5, active: true, stores: { create: true, productId: 'calgym_pro_monthly', periods: 1 } });
  const oldChk = await admin('/admin/api/promo-store', { code: OLD, store: 'apple', action: 'check' });
  check('Check reads how many uses Apple holds', oldChk.result?.ids?.uses === '100' && /holds 100 uses/.test(oldChk.result.detail), JSON.stringify(oldChk.result));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#t-codes');
  await page.waitForTimeout(800);
  await page.locator('#pc_rows tr', { hasText: OLD }).getByRole('button', { name: 'Check' }).first().click();
  await page.waitForTimeout(1200);
  check('  Check on the page asks the limit question', /after 5 uses/.test(await page.textContent('#pc_hardstop').catch(() => '')));

  // Check, and a retry that must reuse what exists.
  const before = (await fakeLog()).appleOffers.length;
  const chk = await admin('/admin/api/promo-store', { code: DISC, store: 'apple', action: 'check' });
  check('Check: Apple offer and custom code active', chk.result?.ok === true, JSON.stringify(chk));
  const again = await admin('/admin/api/promo-store', { code: DISC, store: 'apple', action: 'retry' });
  check('a retry reuses the offer instead of making a second', again.result?.ok === true && (await fakeLog()).appleOffers.length === before);
  const bad = await admin('/admin/api/promo', { code: `PLUS${run}`, kind: 'percent', plan: 'proPlus', percentOff: 20, stores: { create: true, productId: 'calgym_proplus_monthly', periods: 1 } });
  check('Pro+ is refused (not on sale)', bad.error === 'store_product_invalid');
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}-codes.png` : '/tmp/store-codes.png', fullPage: false });
  await browser.close();
} finally {
  for (const k of kids) { try { process.kill(-k.pid); } catch {} }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
