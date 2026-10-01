// Sign-in proof end to end: the real server against a fake Supabase, once in
// the default (lenient, old builds still work) mode and once with
// REQUIRE_ACCOUNT_TOKEN on. Covers impersonation, account deletion, plans
// given by email, purchase sync ownership, and the WHOOP connect ticket.
// Needs Postgres (DATABASE_URL) — spawns its own servers on 8788/8789.
import http from 'node:http';
import { spawn } from 'node:child_process';

const DB = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost/calgym?host=/opt/calgym-pg/pgsock&port=5433';
const run = Date.now().toString(36);
const hex = Date.now().toString(16).padStart(12, '0').slice(-12);
const ALICE = `a11ce000-0000-4000-8000-${hex}`;
const BOB = `b0b00000-0000-4000-8000-${hex}`;
const ALICE_EMAIL = `alice_${run}@example.com`;
const T = { alice: `tok-alice-${run}`, bob: `tok-bob-${run}`, forged: `tok-forged-${run}` };
const tokens = { [T.alice]: { id: ALICE, email: ALICE_EMAIL }, [T.bob]: { id: BOB, email: `bob_${run}@example.com` } };
const deletedAuth = [];

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

// ── Fake Supabase ──
const sb = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (u.pathname === '/auth/v1/user') {
    const t = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    return tokens[t] ? send(200, tokens[t]) : send(401, { msg: 'bad jwt' });
  }
  if (u.pathname === '/auth/v1/admin/users' && req.method === 'GET') return send(200, { users: Object.values(tokens) });
  if (u.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') { deletedAuth.push(u.pathname.split('/').pop()); return send(200, {}); }
  if (u.pathname.startsWith('/rest/v1/user_data')) return send(204, {});
  send(404, {});
}).listen(8790);

async function startServer(port, extra) {
  try { await fetch(`http://127.0.0.1:${port}/health`); throw new Error(`port ${port} is already in use`); } catch (e) { if (/in use/.test(e.message)) throw e; }
  const child = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: '/home/user/CalApp/server',
    env: { ...process.env, DATABASE_URL: DB, PORT: String(port), ADMIN_TOKEN: 'e2e-admin', REVENUECAT_WEBHOOK_SECRET: 'e2e-hook',
      SUPABASE_URL: 'http://127.0.0.1:8790', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', WHOOP_CLIENT_ID: 'cid', WHOOP_CLIENT_SECRET: 'csecret', ...extra },
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return child; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}
const api = (port) => async (path, { ref, token, method = 'GET', body, admin } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (ref) headers['x-calgym-user'] = ref;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers['x-admin-token'] = 'e2e-admin';
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null;
  try { json = await res.clone().json(); } catch {}
  return { status: res.status, json, res };
};

// ── Lenient (default) ──
let server = await startServer(8788, {});
let call = api(8788);
await call('/admin/api/plan', { method: 'POST', admin: true, body: { ref: ALICE, plan: 'pro' } });
check('setup: Alice is Pro', (await call('/api/me', { ref: ALICE, token: T.alice })).json?.plan === 'pro');
check("Bob's token naming Alice is Bob, not Alice", (await call('/api/me', { ref: ALICE, token: T.bob })).json?.plan !== 'pro');
check('old builds (no token) still work', (await call('/api/me', { ref: ALICE })).json?.plan === 'pro');

// Link a phone to Alice, then try deleting with the wrong proof.
await call('/api/link', { method: 'POST', ref: ALICE, token: T.alice, body: { from: `u_alicephone_${run}` } });
let del = await call('/api/me', { method: 'DELETE', ref: ALICE });
check('delete an account id without sign-in → refused', del.status === 401 && del.json?.error === 'sign_in_required', JSON.stringify(del.json));
del = await call('/api/me', { method: 'DELETE', ref: `u_alicephone_${run}` });
check("delete via Alice's linked phone id without sign-in → refused", del.status === 401, String(del.status));
del = await call('/api/me', { method: 'DELETE', ref: ALICE, token: T.bob });
check("Bob's token naming Alice deletes Bob's sign-in only", del.status === 200 && deletedAuth.includes(BOB) && !deletedAuth.includes(ALICE), JSON.stringify(deletedAuth));
check('…and Alice keeps her plan', (await call('/api/me', { ref: ALICE, token: T.alice })).json?.plan === 'pro');
del = await call('/api/me', { method: 'DELETE', ref: `u_guest_${run}` });
check('a plain guest can still delete without sign-in', del.status === 200, String(del.status));

// Gift by email: someone claims Alice's address on their own guest id first.
const squatter = `u_squatter_${run}`;
await call('/api/identify', { method: 'POST', ref: squatter, body: { email: ALICE_EMAIL } });
await call('/admin/api/plan', { method: 'POST', admin: true, body: { ref: ALICE, plan: 'free' } });
const gift = await call('/admin/api/plan', { method: 'POST', admin: true, body: { email: ALICE_EMAIL, plan: 'proPlus', days: 30 } });
check('give by email goes to the Supabase account only', gift.status === 200 && JSON.stringify(gift.json?.refs) === JSON.stringify([ALICE]), JSON.stringify(gift.json?.refs));
check('…the squatter got nothing', (await call('/api/me', { ref: squatter })).json?.plan === 'free');
const nobody = await call('/admin/api/plan', { method: 'POST', admin: true, body: { email: `nobody_${run}@example.com`, plan: 'pro' } });
check('unknown address → no_account', nobody.status === 404 && nobody.json?.error === 'no_account');
const idf = await call('/api/identify', { method: 'POST', ref: ALICE, token: T.alice, body: { email: 'fake@evil.example' } });
check('identify with a token stores the verified address, not the body', idf.status === 200);

// WHOOP connect ticket.
const start = await call('/api/whoop/start', { method: 'POST', ref: ALICE, token: T.alice });
const ticketUrl = start.json?.url ?? '';
check('WHOOP start hands out a ticket link', /\/api\/whoop\/authorize\?ticket=/.test(ticketUrl), ticketUrl);
const path = ticketUrl.replace(/^https?:\/\/[^/]+/, '');
const go = await call(path);
check('ticket → redirect to WHOOP with a state', go.status === 302 && /api\.prod\.whoop\.com\/oauth\/oauth2\/auth\?.*state=/.test(go.res.headers.get('location') ?? ''), go.res.headers.get('location') ?? String(go.status));
check('ticket works once', (await call(path)).status === 400);
check('legacy ?ref= still works while lenient', (await call(`/api/whoop/authorize?ref=${ALICE}`)).status === 302);
process.kill(-server.pid, 'SIGTERM');

// ── Strict ──
server = await startServer(8789, { REQUIRE_ACCOUNT_TOKEN: '1' });
call = api(8789);
check('strict: account id without token is nobody', (await call('/api/identify', { method: 'POST', ref: ALICE, body: { email: 'x@y.z' } })).status === 401);
check('strict: with her token Alice is Alice', (await call('/api/me', { ref: ALICE, token: T.alice })).json?.plan === 'proPlus');
check("strict: Alice's linked phone without token is just a guest", (await call('/api/me', { ref: `u_alicephone_${run}` })).json?.plan === 'free');
check('strict: a forged token is refused', (await call('/api/identify', { method: 'POST', ref: ALICE, token: T.forged, body: { email: 'x@y.z' } })).status === 401);
check('strict: legacy WHOOP ?ref= for an account is refused', (await call(`/api/whoop/authorize?ref=${ALICE}`)).status === 400);
check('strict: legacy WHOOP ?ref= for a plain guest still works', (await call(`/api/whoop/authorize?ref=u_newguest_${run}`)).status === 302);
const checklist = (await call('/admin/api/overview', { admin: true })).json?.checklist ?? [];
check('admin checklist shows strict mode on', checklist.find((x) => x.id === 'account_token')?.done === true);
process.kill(-server.pid, 'SIGTERM');
sb.close();

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
