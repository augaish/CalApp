// Promotion codes, against a real Postgres. Covers the pure validation and
// the parts that only a database can prove: the campaign limit under
// concurrency, once-per-account, and that an edit never resets the counters.
//
// Needs DATABASE_URL pointing at a throwaway database.
import { cleanDraft, codeProblem, normalizeCode, redeemPromo, remaining, grantUntil } from '/home/user/CalApp/server/src/promo.ts';
import {
  claimPromo, deletePromo, getOrCreateUser, getPromo, initDb, listPromos,
  listRedemptions, upsertPromo,
} from '/home/user/CalApp/server/src/db.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ── normalisation ──
eq('a code typed with spaces and a dash still matches', normalizeCode(' sum-mer 25 '), 'SUMMER25');
eq('lower case is lifted', normalizeCode('welcome'), 'WELCOME');
eq('Arabic-Indic digits fold to Latin', normalizeCode('صيف٢٥'), '25');
eq('Eastern Arabic digits fold too', normalizeCode('RAMADAN۵۰'), 'RAMADAN50');
eq('nothing usable is empty', normalizeCode('؟؟؟'), '');
check('length is bounded', normalizeCode('A'.repeat(80)).length === 32);

// ── draft validation ──
const bad = (label: string, draft: Parameters<typeof cleanDraft>[0], want: string) => {
  const r = cleanDraft(draft);
  check(label, !r.ok && r.error === want, r.ok ? 'accepted' : r.error);
};
bad('a two-character code is refused', { code: 'AB' }, 'code_too_short');
bad('a code cannot grant the free tier', { code: 'NOPE', plan: 'free' }, 'plan_must_be_paid');
bad('a percent code needs a percentage in range', { code: 'HALF', kind: 'percent', percentOff: 0 }, 'percent_out_of_range');
bad('  and one over 100 is refused', { code: 'HALF', kind: 'percent', percentOff: 120 }, 'percent_out_of_range');
bad('a percent code without a store offer is refused', { code: 'HALF', kind: 'percent', percentOff: 50 }, 'offer_required');
bad('a free code with a silly duration is refused', { code: 'LONG', durationDays: 99999 }, 'duration_out_of_range');
bad('a limit below one is refused', { code: 'ZERO', maxRedemptions: 0 }, 'max_out_of_range');
bad('an unreadable date is refused', { code: 'WHEN', expiresAt: 'soon' }, 'bad_expires_at');
bad('expiry before the start is refused', { code: 'BACK', startsAt: '2026-10-10', expiresAt: '2026-10-01' }, 'expires_before_starts');

const freeDraft = cleanDraft({ code: 'gym-partner', durationDays: 90, maxRedemptions: 3, note: 'Gold gym' });
check('a free code cleans up', freeDraft.ok && freeDraft.value.code === 'GYMPARTNER' && freeDraft.value.kind === 'free' && freeDraft.value.percentOff === 100 && freeDraft.value.durationDays === 90, JSON.stringify(freeDraft));
const pctDraft = cleanDraft({ code: 'half50', kind: 'percent', percentOff: 50, offerIos: 'pro_half_year', maxRedemptions: 100 });
check('a percent code keeps its offer and drops the duration', pctDraft.ok && pctDraft.value.percentOff === 50 && pctDraft.value.durationDays === null && pctDraft.value.offerIos === 'pro_half_year', JSON.stringify(pctDraft));
check('a free code defaults to thirty days', (cleanDraft({ code: 'PLAIN' }) as { value: { durationDays: number } }).value.durationDays === 30);

// ── problems, without a database ──
const row = (over: Record<string, unknown> = {}) => ({
  code: 'X', kind: 'free' as const, plan: 'pro' as const, percentOff: 100, durationDays: 30,
  offerIos: null, offerAndroid: null, maxRedemptions: null, redeemedCount: 0,
  startsAt: null, expiresAt: null, active: true, note: null, createdAt: new Date().toISOString(), ...over,
});
eq('an active, unlimited, undated code has no problem', codeProblem(row()), null);
eq('a switched-off code says so', codeProblem(row({ active: false })), 'inactive');
eq('a future code has not started', codeProblem(row({ startsAt: '2099-01-01T00:00:00Z' })), 'not_started');
eq('a past code has expired', codeProblem(row({ expiresAt: '2020-01-01T00:00:00Z' })), 'expired');
eq('a used-up code is exhausted', codeProblem(row({ maxRedemptions: 5, redeemedCount: 5 })), 'exhausted');
eq('remaining counts down', remaining(row({ maxRedemptions: 5, redeemedCount: 2 })), 3);
eq('an unlimited code has no remaining number', remaining(row()), null);
check('a grant lands the right number of days out', (() => {
  const from = new Date('2026-01-01T00:00:00Z');
  return grantUntil(90, from).startsWith('2026-04-01');
})(), grantUntil(90, new Date('2026-01-01T00:00:00Z')));

// ── against the database ──
if (!process.env.DATABASE_URL) {
  console.log('SKIP  database checks (no DATABASE_URL)');
  console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
}
await initDb();
for (const c of ['GYMPARTNER', 'HALF50', 'ONEONLY', 'RACE', 'EDITME']) await deletePromo(c);

await upsertPromo((cleanDraft({ code: 'GYMPARTNER', durationDays: 90, maxRedemptions: 3 }) as { value: never }).value);
const r1 = await redeemPromo('gym partner', 'user-a');
check('a free code grants the tier', r1.ok && r1.kind === 'free' && r1.plan === 'pro', JSON.stringify(r1));
check('  and the account is on that tier now', (await getOrCreateUser('user-a'))?.plan === 'pro');
check('  with the grant dated, not open-ended', !!(await getOrCreateUser('user-a'))?.planUntil);
check('  and the source names the code', (await getOrCreateUser('user-a'))?.planSource === 'promo:GYMPARTNER');
eq('  the counter moved to one', (await getPromo('GYMPARTNER'))?.redeemedCount, 1);

const again = await redeemPromo('GYMPARTNER', 'user-a');
check('the same person cannot use it twice', !again.ok && again.reason === 'already_redeemed', JSON.stringify(again));
eq('  and the counter did not move', (await getPromo('GYMPARTNER'))?.redeemedCount, 1);

await redeemPromo('GYMPARTNER', 'user-b');
await redeemPromo('GYMPARTNER', 'user-c');
const fourth = await redeemPromo('GYMPARTNER', 'user-d');
check('the fourth person hits the campaign limit', !fourth.ok && fourth.reason === 'exhausted', JSON.stringify(fourth));
eq('  the counter stopped at the limit', (await getPromo('GYMPARTNER'))?.redeemedCount, 3);
eq('  and three redemptions are on record', (await listRedemptions('GYMPARTNER')).length, 3);
check('  each naming who used it', (await listRedemptions('GYMPARTNER')).map((r) => r.ref).sort().join(',') === 'user-a,user-b,user-c');

// A limit of one, hit by ten simultaneous taps: exactly one may pass.
await upsertPromo((cleanDraft({ code: 'RACE', durationDays: 7, maxRedemptions: 1 }) as { value: never }).value);
const results = await Promise.all(Array.from({ length: 10 }, (_, i) => redeemPromo('RACE', `racer-${i}`)));
eq('ten simultaneous redemptions of a one-use code: exactly one wins', results.filter((r) => r.ok).length, 1);
eq('  and the counter reads one, not ten', (await getPromo('RACE'))?.redeemedCount, 1);

// Editing a live campaign must not forgive the redemptions already made.
await upsertPromo((cleanDraft({ code: 'EDITME', durationDays: 30, maxRedemptions: 2 }) as { value: never }).value);
await redeemPromo('EDITME', 'user-e');
await upsertPromo((cleanDraft({ code: 'EDITME', durationDays: 60, maxRedemptions: 5, note: 'extended' }) as { value: never }).value);
const edited = await getPromo('EDITME');
check('an edit keeps the counter', edited?.redeemedCount === 1, String(edited?.redeemedCount));
check('  while the new terms apply', edited?.durationDays === 60 && edited?.maxRedemptions === 5 && remaining(edited!) === 4);
const sameAgain = await redeemPromo('EDITME', 'user-e');
check('  and the person who already used it still cannot repeat', !sameAgain.ok && sameAgain.reason === 'already_redeemed');

// Switching a campaign off stops it mid-flight.
await upsertPromo((cleanDraft({ code: 'EDITME', durationDays: 60, maxRedemptions: 5, active: false }) as { value: never }).value);
const stopped = await redeemPromo('EDITME', 'user-f');
check('switching a code off stops it immediately', !stopped.ok && stopped.reason === 'inactive', JSON.stringify(stopped));

// A percent code grants nothing by itself; it hands over the store offer.
await upsertPromo((cleanDraft({ code: 'HALF50', kind: 'percent', percentOff: 50, offerIos: 'pro_half', offerAndroid: 'pro-half', maxRedemptions: 2 }) as { value: never }).value);
const pct = await redeemPromo('half 50', 'user-g');
check('a percent code returns the store offer', pct.ok && pct.kind === 'percent' && pct.percentOff === 50 && pct.offerIos === 'pro_half', JSON.stringify(pct));
check('  and grants no tier on its own', (await getOrCreateUser('user-g'))?.plan === 'free', (await getOrCreateUser('user-g'))?.plan);
eq('  but is still counted', (await getPromo('HALF50'))?.redeemedCount, 1);

const unknown = await redeemPromo('NOSUCHCODE', 'user-h');
check('an unknown code says unknown', !unknown.ok && unknown.reason === 'unknown');
const tooShort = await redeemPromo('A', 'user-h');
check('a code too short to be real is unknown, not a crash', !tooShort.ok && tooShort.reason === 'unknown');

check('the admin list carries every code', (await listPromos()).length >= 3);

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
