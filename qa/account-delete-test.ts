// "Delete my account" on the server: everything personal goes (for the
// account and every device linked to it), money records stay but lose the
// person, and the sign-in account itself is deleted through Supabase.
// Needs DATABASE_URL (a scratch Postgres).
import pg from '/home/user/CalApp/server/node_modules/pg/lib/index.js';
import { deleteUser, getOrCreateUser, initDb, resolveRef } from '/home/user/CalApp/server/src/db.ts';
import { deleteAuthUser } from '/home/user/CalApp/server/src/supabase-admin.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
await initDb();
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const run = Date.now().toString(36);
const acct = `acct_${run}`, device = `u_dev_${run}`, other = `u_other_${run}`;
for (const r of [acct, device, other]) await getOrCreateUser(r);
await db.query(`INSERT INTO ref_links (from_ref, to_ref) VALUES ($1, $2)`, [device, acct]);
await db.query(`INSERT INTO usage_counters (ref, period, kind, count) VALUES ($1,'2026-09','meal',3), ($2,'2026-09','meal',1), ($3,'2026-09','meal',2)`, [acct, device, other]);
await db.query(`INSERT INTO whoop_connections (ref, access_token, expires_at, scope) VALUES ($1,'secret-token', now(), 'read')`, [device]);
await db.query(`INSERT INTO promo_codes (code) VALUES ($1) ON CONFLICT DO NOTHING`, [`DEL${run}`.toUpperCase()]);
await db.query(`INSERT INTO promo_redemptions (code, ref, plan) VALUES ($1,$2,'pro')`, [`DEL${run}`.toUpperCase(), acct]);
await db.query(`INSERT INTO billing_events (event_id, ref, type) VALUES ($1,$2,'INITIAL_PURCHASE')`, [`ev_${run}`, acct]);
await db.query(`INSERT INTO partners (id, name, token) VALUES ($1,'P',$2)`, [`p_${run}`, `tok_${run}`]);
await db.query(`INSERT INTO partner_earnings (transaction_id, kind, level, partner_id, via_code, sold_code, ref, pct, net_usd, amount_usd) VALUES ($1,'sale',0,$2,'X','X',$3,10,10,1)`, [`t_${run}`, `p_${run}`, acct]);
await db.query(`INSERT INTO barcode_cache (barcode, item, source, status, contributed_by) VALUES ($1,'{}','label','pending',$2)`, [`99${Date.now()}`, device]);

await deleteUser(await resolveRef(acct));

const count = async (sql: string, args: unknown[]) => Number((await db.query(sql, args)).rows[0].n);
check('the account row is gone', (await count(`SELECT COUNT(*) n FROM app_users WHERE ref = ANY($1)`, [[acct, device]])) === 0);
check('usage for the account and its linked device is gone', (await count(`SELECT COUNT(*) n FROM usage_counters WHERE ref = ANY($1)`, [[acct, device]])) === 0);
check('the WHOOP connection and its tokens are gone', (await count(`SELECT COUNT(*) n FROM whoop_connections WHERE ref = $1`, [device])) === 0);
check('code redemptions are gone (the code keeps its count)', (await count(`SELECT COUNT(*) n FROM promo_redemptions WHERE ref = $1`, [acct])) === 0);
check('the device link is gone', (await count(`SELECT COUNT(*) n FROM ref_links WHERE from_ref = $1`, [device])) === 0);
check('store events stay, without the person', (await count(`SELECT COUNT(*) n FROM billing_events WHERE event_id = $1 AND ref IS NULL`, [`ev_${run}`])) === 1);
check('partner earnings stay (money owed), without the person', (await count(`SELECT COUNT(*) n FROM partner_earnings WHERE transaction_id = $1 AND ref = 'deleted'`, [`t_${run}`])) === 1);
check('a product they read stays for everyone, without their name on it', (await count(`SELECT COUNT(*) n FROM barcode_cache WHERE contributed_by = $1`, [device])) === 0);
check('someone else is untouched', (await count(`SELECT COUNT(*) n FROM usage_counters WHERE ref = $1`, [other])) === 1 && (await count(`SELECT COUNT(*) n FROM app_users WHERE ref = $1`, [other])) === 1);

// ── the sign-in account ──
const calls: string[] = [];
const fake = (userOk: boolean, delStatus = 200) => (async (url: string, init?: RequestInit) => {
  calls.push(`${init?.method ?? 'GET'} ${url.replace(/^https:\/\/x\.supabase\.co/, '')}`);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify(userOk ? { id: '11111111-2222-3333-4444-555555555555' } : {}), { status: userOk ? 200 : 401 });
  return new Response('{}', { status: url.includes('/admin/users/') ? delStatus : 200 });
}) as typeof fetch;
check('not signed in: nothing to delete', (await deleteAuthUser(null, fake(true))) === 'not_signed_in');
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
check('without the admin key it says so', (await deleteAuthUser('tok', fake(true))) === 'not_configured');
process.env.SUPABASE_URL = 'https://x.supabase.co/'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
check('a bad token deletes nothing', (await deleteAuthUser('bad', fake(false))) === 'invalid_token' && !calls.some((c) => c.startsWith('DELETE')));
calls.length = 0;
check('a good token deletes the backup and the account', (await deleteAuthUser('good', fake(true))) === 'deleted' &&
  calls.includes('DELETE /rest/v1/user_data?user_id=eq.11111111-2222-3333-4444-555555555555') &&
  calls.includes('DELETE /auth/v1/admin/users/11111111-2222-3333-4444-555555555555'), calls.join(' | '));
check('a store-side failure is reported, not hidden', (await deleteAuthUser('good', fake(true, 500))) === 'failed');

await db.end();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
