// WHOOP API terms: disconnecting cancels access at WHOOP, WHOOP data never
// goes to DeepSeek (not even as a fallback), coach sharing of WHOOP data is
// an explicit opt-in, and disconnecting clears WHOOP data from the phone.
//
// Run: DATABASE_URL=… server/node_modules/.bin/tsx --import ./qa/fakes/register.mjs qa/whoop-compliance-test.mts
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { initDb, setWhoopConnection, getWhoopConnection } = await import('../server/src/db.ts');
const { hasWearableData, revokeWhoopAccess } = await import('../server/src/whoop.ts');
const { withProviderFallback } = await import('../server/src/provider-fallback.ts');
const { useAppStore, migrateStore } = require('../src/lib/store.ts') as typeof import('../src/lib/store');
const { buildCoachContext } = require('../src/lib/coach-context.ts') as typeof import('../src/lib/coach-context');

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

// ── Server: which requests carry WHOOP data ──
check('a whoop block counts', hasWearableData({ whoop: { recoveryScore: 60 } }));
check('the app flag counts (burn totals from WHOOP)', hasWearableData({ wearableData: true, days: [] }));
check('nothing from WHOOP → not flagged', !hasWearableData({ days: [], whoop: undefined }) && !hasWearableData(null) && !hasWearableData('x'));

// ── Server: no fallback to DeepSeek when told not to ──
const calls: string[] = [];
const deps = { available: () => true, record: async () => {} };
const failing = { claude: async () => { calls.push('claude'); throw new Error('overloaded'); }, deepseek: async () => { calls.push('deepseek'); return 'ds'; } };
let threw = false;
try { await withProviderFallback('/t', 'claude', failing, deps, { fallback: false }); } catch { threw = true; }
check('WHOOP request: Claude fails → error, DeepSeek never called', threw && calls.join() === 'claude', calls.join());
calls.length = 0;
const out = await withProviderFallback('/t', 'claude', failing, deps);
check('other requests still fall back as before', out === 'ds' && calls.join() === 'claude,deepseek', calls.join());

// ── Server: disconnect revokes at WHOOP ──
await initDb();
const ref = `whoop-test-${Date.now()}`;
await setWhoopConnection(ref, { accessToken: 'tok-123', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000), scope: 'read:recovery offline' });
const realFetch = globalThis.fetch;
const seen: { url: string; method?: string; auth?: string }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  seen.push({ url: String(url), method: init?.method, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
  return new Response(null, { status: 204 });
}) as typeof fetch;
const revoked = await revokeWhoopAccess(ref);
check('revoke calls DELETE /v2/user/access with the user token', revoked && seen.length === 1 && seen[0].method === 'DELETE' && seen[0].url === 'https://api.prod.whoop.com/developer/v2/user/access' && seen[0].auth === 'Bearer tok-123', JSON.stringify(seen));
seen.length = 0;
check('no connection → nothing to revoke, no call', (await revokeWhoopAccess('nobody-here')) === false && seen.length === 0);
globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
check('a failed revoke never throws', (await revokeWhoopAccess(ref)) === false);
globalThis.fetch = realFetch;
check('(test row still there for the route to delete)', !!(await getWhoopConnection(ref)));

// ── App: opt-in by default, and old installs start from "no" ──
check('new install: WHOOP sharing off', useAppStore.getState().coachShare.wearable === false);
const migrated = migrateStore({ coachShare: { food: true, training: true, body: true, wearable: true } }, 15) as { coachShare: { wearable: boolean; food: boolean } };
check('update from v15: WHOOP sharing reset to off, the rest kept', migrated.coachShare.wearable === false && migrated.coachShare.food === true);

// ── App: what the coach receives ──
const today = new Date();
const key = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
globalThis.fetch = (async () => new Response(JSON.stringify({ connected: true, recoveryScore: 72, todayStrain: 9.1 }), { status: 200 })) as typeof fetch;
useAppStore.setState({ whoopBurnByDay: { [key]: 640 }, whoopWorkoutsByDay: {}, coachShare: { food: true, training: true, body: true, wearable: false } });
let ctx = await buildCoachContext('en', 2) as Record<string, unknown> & { days: { burned: number }[] };
check('sharing off: no WHOOP block, no flag, WHOOP burn left out', !ctx.whoop && !ctx.wearableData && ctx.days[0].burned !== 640, JSON.stringify({ whoop: ctx.whoop, flag: ctx.wearableData, burned: ctx.days[0].burned }));
useAppStore.getState().setCoachShare({ wearable: true });
ctx = await buildCoachContext('en', 2) as typeof ctx;
check('sharing on: WHOOP block and the flag the server routes on', !!ctx.whoop && ctx.wearableData === true && hasWearableData(ctx));

// ── App: disconnect clears WHOOP data ──
useAppStore.getState().clearWhoopData();
const s = useAppStore.getState();
check('disconnect: WHOOP figures gone and sharing back off', Object.keys(s.whoopBurnByDay).length === 0 && Object.keys(s.whoopWorkoutsByDay).length === 0 && s.whoopBackfilledAt === null && s.coachShare.wearable === false);
globalThis.fetch = realFetch;

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
