// The WHOOP return page must never run script that came from its own URL
// (it used to splice WHOOP's `error` param into an inline <script>), and it
// must still hand the app its calapp:// return link. Plus the baseline
// browser headers every reply carries.
// Needs the server on 8787.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const API = 'http://127.0.0.1:8787';

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const payloads = [
  "'-alert(document.domain)-'",
  "x';alert(1);//",
  '</script><script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  ' alert(1)',
];
const browser = await chromium.launch();
const ctx = await browser.newContext();
for (const p of payloads) {
  const page = await ctx.newPage();
  let fired = null;
  page.on('dialog', async (d) => { fired = d.message(); await d.dismiss(); });
  // Stop at the calapp:// hand-off so the page stays inspectable.
  await page.route('calapp://**', (r) => r.abort());
  await page.goto(`${API}/api/whoop/callback?error=${encodeURIComponent(p)}`).catch(() => {});
  await page.waitForTimeout(600);
  check(`no script runs from error=${JSON.stringify(p).slice(0, 40)}`, fired === null, String(fired));
  await page.close();
}

// The page still sends the app its return link, with the reason readable.
const html = await (await fetch(`${API}/api/whoop/callback?error=access_denied`)).text();
const m = html.match(/window\.location\.href = ("[^"]*");/);
const link = m ? JSON.parse(m[1]) : '';
check('return link is a quoted string literal', !!m, html.slice(-300));
check('…to calapp://whoop-callback with status=error', link.startsWith('calapp://whoop-callback?status=error&reason='), link);
check('…and the reason survives', decodeURIComponent(link.split('reason=')[1] ?? '') === 'WHOOP said: access_denied', link);
check('the denial text on the page is trimmed to a code', html.includes('WHOOP said: access_denied'));
const weird = await (await fetch(`${API}/api/whoop/callback?error=${encodeURIComponent('<b>hi</b>')}`)).text();
check('markup in the error never reaches the page', !weird.includes('<b>hi</b>') && !weird.includes('&lt;b&gt;'), weird.match(/WHOOP said:[^<]*/)?.[0] ?? '');

// Expired state: still a working page.
const expired = await (await fetch(`${API}/api/whoop/callback?state=nope&code=x`)).text();
check('expired link explains itself', /expired or was already used/.test(expired));

const res = await fetch(`${API}/privacy`);
check('X-Frame-Options: DENY', res.headers.get('x-frame-options') === 'DENY');
check('X-Content-Type-Options: nosniff', res.headers.get('x-content-type-options') === 'nosniff');
check('Referrer-Policy set', res.headers.get('referrer-policy') === 'strict-origin-when-cross-origin');
const admin = await fetch(`${API}/admin`);
check('admin console cannot be framed', admin.headers.get('x-frame-options') === 'DENY');

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
