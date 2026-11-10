// Codes for people who already subscribe (a free trial counts), end to end:
// on Android a free code's days go on the end of the Play subscription
// (through a stand-in RevenueCat that records the defer), a discount is
// refused plainly, a failed defer leaves the code unspent; on iPhone the
// member is handed Apple's offer, which starts after their current period.
//
// Needs: Postgres as for the other e2e suites. Starts its own server on :8789
// and a stand-in RevenueCat on :8797.
import http from 'node:http';
import { spawn } from 'node:child_process';

const API = 'http://127.0.0.1:8789';
const DB = process.env.DATABASE_URL || 'postgresql://postgres@localhost/calgym?host=/opt/calgym-pg/pgsock&port=5433';
const run = Date.now().toString(36).toUpperCase();
const DAY = 86400000;
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`); };

// ── Stand-in RevenueCat: subscribers with a Play trial, and the defer call ──
const trialEnds = Date.now() + 10 * DAY;
const subs = {}; // app user id → { key, expires, store }
const defers = [];
const failDefer = new Set();
const rc = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer rc-secret') return send(401, { message: 'bad key' });
    const m = req.url.match(/^\/v1\/subscribers\/([^/]+)(?:\/subscriptions\/([^/]+)\/defer)?$/);
    if (!m) return send(404, {});
    const id = decodeURIComponent(m[1]);
    const s = subs[id];
    if (!m[2]) {
      const subscriptions = s ? { [s.key]: { store: s.store, expires_date: new Date(s.expires).toISOString(), period_type: 'trial' } } : {};
      const entitlements = s ? { pro: { expires_date: new Date(s.expires).toISOString(), product_identifier: s.key } } : {};
      return send(200, { subscriber: { subscriptions, entitlements } });
    }
    // RevenueCat wants the Play product without the base plan.
    if (decodeURIComponent(m[2]) !== 'calgym_pro_monthly') return send(400, { message: 'unknown product' });
    if (failDefer.has(id)) return send(500, { message: 'Google said no' });
    const { expiry_time_ms } = JSON.parse(body || '{}');
    defers.push({ id, expiry_time_ms });
    s.expires = expiry_time_ms;
    return send(200, { subscriber: {} });
  });
});
await new Promise((r) => rc.listen(8797, '127.0.0.1', r));

const kids = [];
const env = {
  ...process.env, DATABASE_URL: DB, PORT: '8789', ADMIN_TOKEN: 'e2e-admin', REVENUECAT_WEBHOOK_SECRET: 'e2e-hook',
  REVENUECAT_SECRET_KEY: 'rc-secret', REVENUECAT_API_URL: 'http://127.0.0.1:8797',
  ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:8799',
};
delete env.DEEPSEEK_API_KEY;
kids.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: '/home/user/CalApp/server', env, stdio: 'ignore', detached: true }));
for (let i = 0; i < 80; i++) { try { await fetch(`${API}/health`); break; } catch {} await new Promise((r) => setTimeout(r, 400)); }

const admin = (p, body) => fetch(`${API}${p}`, { method: body ? 'POST' : 'GET', headers: { 'x-admin-token': 'e2e-admin', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const hook = (event) => fetch(`${API}/api/billing/revenuecat`, { method: 'POST', headers: { authorization: 'e2e-hook', 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) }).then((r) => r.json());
const redeem = (ref, code, platform) => fetch(`${API}/api/redeem`, { method: 'POST', headers: { 'x-calgym-user': ref, 'Content-Type': 'application/json' }, body: JSON.stringify({ code, platform }) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const trialStart = (ref, store) => hook({ id: `ev_${ref}`, type: 'INITIAL_PURCHASE', app_user_id: ref, product_id: 'calgym_pro_monthly', entitlement_ids: ['pro'], period_type: 'TRIAL', price: 0, store, environment: 'PRODUCTION', transaction_id: `t_${ref}`, purchased_at_ms: Date.now(), expiration_at_ms: trialEnds, event_timestamp_ms: Date.now() });

try {
  const FREE = `MONTH${run}`, DISC = `HALF${run}`;
  check('free code made', (await admin('/admin/api/promo', { code: FREE, kind: 'free', plan: 'pro', durationDays: 30, offerIos: FREE, offerAndroid: FREE.toLowerCase(), active: true })).ok === true);
  check('discount code made', (await admin('/admin/api/promo', { code: DISC, kind: 'percent', plan: 'pro', percentOff: 50, offerIos: DISC, offerAndroid: DISC.toLowerCase(), active: true })).ok === true);

  // Android, in the free trial.
  const A = `u_cm_a_${run}`;
  subs[A] = { key: 'calgym_pro_monthly:monthly', expires: trialEnds, store: 'play_store' };
  await trialStart(A, 'PLAY_STORE');
  const r1 = await redeem(A, FREE, 'android');
  const want = new Date(trialEnds + 30 * DAY).toISOString();
  check('Android trial member: free code accepted, days added after the trial', r1.ok && r1.kind === 'free' && r1.extended === true && r1.until === want, JSON.stringify(r1));
  check('  the Play subscription was deferred by 30 days from the trial end', defers.length === 1 && defers[0].expiry_time_ms === trialEnds + 30 * DAY, JSON.stringify(defers));
  const me = await fetch(`${API}/api/me`, { headers: { 'x-calgym-user': A } }).then((r) => r.json());
  check('  still Pro', me.plan === 'pro', me.plan);
  check('  the code counts one redemption', (await admin('/admin/api/promos')).promos.find((p) => p.code === FREE)?.redeemedCount === 1);
  const r2 = await redeem(A, FREE, 'android');
  check('  the same code twice is refused', !r2.ok && r2.error === 'already_redeemed' && defers.length === 1, JSON.stringify(r2));
  const r3 = await redeem(A, DISC, 'android');
  check('Android member: a discount is refused plainly', !r3.ok && r3.error === 'member_discount', JSON.stringify(r3));

  // Android, the store refuses the defer: the code stays unspent.
  const B = `u_cm_b_${run}`;
  subs[B] = { key: 'calgym_pro_monthly:monthly', expires: trialEnds, store: 'play_store' };
  failDefer.add(B);
  await trialStart(B, 'PLAY_STORE');
  const r4 = await redeem(B, FREE, 'android');
  check('Android: a failed defer says so', !r4.ok && r4.error === 'extend_failed', JSON.stringify(r4));
  check('  and the code is not spent', (await admin('/admin/api/promos')).promos.find((p) => p.code === FREE)?.redeemedCount === 1);

  // iPhone, in the free trial: Apple's offer, which starts after the current period.
  const C = `u_cm_c_${run}`;
  await trialStart(C, 'APP_STORE');
  const r5 = await redeem(C, FREE, 'ios');
  check('iPhone trial member: handed the Apple offer (not "already subscribed")', r5.ok && r5.offerIos === FREE && r5.freeDays === 30, JSON.stringify(r5));
  const r6 = await redeem(C, DISC, 'ios');
  check('iPhone member: a discount is handed to Apple too', r6.ok && r6.offerIos === DISC, JSON.stringify(r6));

  // Not a member on Android: the usual store offer.
  const D = `u_cm_d_${run}`;
  const r7 = await redeem(D, FREE, 'android');
  check('Android newcomer: the Play offer as before', r7.ok && r7.offerAndroid === FREE.toLowerCase(), JSON.stringify(r7));
} finally {
  for (const k of kids) { try { process.kill(-k.pid); } catch {} }
  rc.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
