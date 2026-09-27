// The public pages the stores ask for — privacy, terms, support and account
// deletion — and the web deletion request reaching the admin console.
// Needs: the server on :8787 with ADMIN_TOKEN=e2e-admin and a database.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const API = 'http://127.0.0.1:8787';
const OUT = './qa-out/public-pages';
fs.mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36);
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${API}/privacy`);
const privacy = await page.textContent('body');
check('privacy names both AI providers', privacy.includes('Anthropic') && privacy.includes('DeepSeek') && privacy.includes('China'));
check('privacy says permission is asked first and where to withdraw it', /asks your permission/.test(privacy) && /AI processing/.test(privacy));
check('privacy covers RevenueCat, WHOOP, codes and partners', ['RevenueCat', 'WHOOP', 'partner'].every((w) => privacy.includes(w)));
check('privacy links to the deletion page and support', (await page.locator('a[href="/account-deletion"]').count()) > 0 && (await page.locator('a[href="/support"]').count()) > 0);
check('privacy has the Arabic version', privacy.includes('سياسة الخصوصية') && privacy.includes('DeepSeek'));
await page.goto(`${API}/terms`);
check('terms cover codes, auto-renewal and cancelling', /Promotion codes/.test(await page.textContent('body')) && /renew automatically/.test(await page.textContent('body')));
await page.goto(`${API}/support`);
const support = await page.textContent('body');
check('support: contact, cancel, restore and refund help', /Cancel or change a subscription/.test(support) && /Restore purchases/.test(support) && /reportaproblem/.test(support));
await page.screenshot({ path: `${OUT}/support.png`, fullPage: true });

await page.goto(`${API}/account-deletion`);
check('deletion page explains the in-app way first', /Profile → Privacy → Delete my account/.test(await page.textContent('body')));
await page.fill('#email', 'not-an-email');
await page.evaluate(() => document.querySelector('#email').type = 'text'); // let the server see the bad value
await page.click('button[type=submit]');
check('a bad address is refused, saying why', /Please enter the email address/.test(await page.textContent('body')));
const email = `del_${run}@example.com`;
await page.fill('#email', email);
await page.fill('#note', 'Please remove everything');
await page.click('button[type=submit]');
check('a request is accepted with a 30-day promise', /Request received/.test(await page.textContent('body')));
await page.screenshot({ path: `${OUT}/deletion-sent.png`, fullPage: true });
// A bot filling the hidden field is told "received" but nothing is stored.
await fetch(`${API}/account-deletion`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `email=bot_${run}%40example.com&website=spam` });

const list = await (await fetch(`${API}/admin/api/deletion-requests`, { headers: { 'x-admin-token': 'e2e-admin' } })).json();
const mine = list.requests.find((r) => r.email === email);
check('the request reaches the admin console', !!mine && mine.note === 'Please remove everything' && !mine.doneAt);
check('a bot\'s request is not stored', !list.requests.some((r) => r.email === `bot_${run}@example.com`));
const again = await fetch(`${API}/account-deletion`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `email=${encodeURIComponent(email.toUpperCase())}` });
const list2 = await (await fetch(`${API}/admin/api/deletion-requests`, { headers: { 'x-admin-token': 'e2e-admin' } })).json();
check('asking twice while open adds nothing', again.ok && list2.requests.filter((r) => r.email.toLowerCase() === email).length === 1);

// Admin: the Users tab shows it; closing it marks it done.
const admin = await browser.newPage({ viewport: { width: 1200, height: 900 } });
admin.on('dialog', (d) => d.accept());
await admin.goto(`${API}/admin#users`);
await admin.fill('#token', 'e2e-admin');
await admin.keyboard.press('Enter');
await admin.waitForSelector('#dr_rows table');
check('admin: Users lists the request', (await admin.textContent('#dr_rows')).includes(email));
check('admin: the Users tab shows a badge', (await admin.textContent('#b-users')).trim() !== '');
await admin.locator('#dr_rows tr', { hasText: email }).getByRole('button').click();
await admin.waitForTimeout(800);
const list3 = await (await fetch(`${API}/admin/api/deletion-requests`, { headers: { 'x-admin-token': 'e2e-admin' } })).json();
check('admin: closing marks it done', !!list3.requests.find((r) => r.email === email)?.doneAt);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
