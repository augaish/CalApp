// Who a request is from (server/src/identity.ts): a valid sign-in token wins
// over the header, an account id without a token is refused once strict
// mode is on, and nobody can sync someone else's store purchase.
import { identify, ownStoreId, verifyAccessToken } from '/home/user/CalApp/server/src/identity.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const links: Record<string, string> = { u_alice_phone: ALICE };
const resolveRef = async (r: string) => links[r] ?? r;
const tokens: Record<string, string> = { 'tok-alice': ALICE, 'tok-bob': BOB };
const verify = async (t: string) => (tokens[t] ? { id: tokens[t], email: null } : null);
const run = (raw: string | null, token: string | null, enforce: boolean) => identify(raw, token, { resolveRef, verify, enforce });

for (const enforce of [false, true]) {
  const m = enforce ? 'strict' : 'lenient';
  check(`${m}: valid token → that account`, (await run(ALICE, 'tok-alice', enforce)) === ALICE);
  check(`${m}: Bob's token naming Alice → Bob, never Alice`, (await run(ALICE, 'tok-bob', enforce)) === BOB);
  check(`${m}: guest install → itself`, (await run('u_guest', null, enforce)) === 'u_guest');
}
check('lenient: account id without token still works (old builds)', (await run(ALICE, null, false)) === ALICE);
check('lenient: linked install without token → its account (as before)', (await run('u_alice_phone', null, false)) === ALICE);
check('lenient: bad token ignored, header used', (await run('u_guest', 'tok-junk', false)) === 'u_guest');
check('strict: account id without token → refused', (await run(ALICE, null, true)) === null);
check('strict: linked install without token → only the bare install', (await run('u_alice_phone', null, true)) === 'u_alice_phone');
check('strict: bad token → refused', (await run(ALICE, 'tok-junk', true)) === null);
check('no header, no token → nobody', (await run(null, null, false)) === null);

check('store id: own account id kept', (await ownStoreId(ALICE, ALICE, resolveRef)) === ALICE);
check('store id: own linked install kept', (await ownStoreId('u_alice_phone', ALICE, resolveRef)) === 'u_alice_phone');
check("store id: someone else's account id replaced by the caller's", (await ownStoreId(ALICE, BOB, resolveRef)) === BOB);
check("store id: someone else's linked install replaced", (await ownStoreId('u_alice_phone', BOB, resolveRef)) === BOB);

// Token checks go to Supabase once, then come from the cache.
process.env.SUPABASE_URL = 'https://sb.example';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_x';
let calls = 0;
const fakeFetch = (async (_u: string, init: RequestInit) => {
  calls++;
  const auth = (init.headers as Record<string, string>).Authorization;
  if (auth === 'Bearer good') return new Response(JSON.stringify({ id: ALICE, email: 'Alice@Example.com' }), { status: 200 });
  if (auth === 'Bearer down') return new Response('', { status: 503 });
  return new Response('{}', { status: 401 });
}) as typeof fetch;
const v1 = await verifyAccessToken('good', fakeFetch);
const v2 = await verifyAccessToken('good', fakeFetch);
check('verified: id and lower-cased email', v1?.id === ALICE && v1?.email === 'alice@example.com');
check('second check served from cache', v2?.id === ALICE && calls === 1, String(calls));
check('rejected token → null', (await verifyAccessToken('bad', fakeFetch)) === null);
calls = 0;
await verifyAccessToken('down', fakeFetch);
await verifyAccessToken('down', fakeFetch);
check('Supabase outage is not remembered', calls === 2, String(calls));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
