// Logging out and signing in as someone else on the same phone: an account's
// logs never end up in another account, logging out backs up and clears the
// phone, and signing back in restores. A guest's logs are still adopted by
// the first account they sign in to.
//
// Run: server/node_modules/.bin/tsx --import ./qa/fakes/register.mjs qa/account-switch-test.mts
import { createRequire } from 'node:module';
// Loaded with require, like the app code under test (tsx compiles src to
// CommonJS), so the test and the app share one store and one fake.
const require = createRequire(import.meta.url);
const { fake } = require('./fakes/supabase-fake.ts') as typeof import('./fakes/supabase-fake');
const { logOut } = require('../src/lib/account.ts') as typeof import('../src/lib/account');
const { syncAuthIdentity } = require('../src/lib/auth.ts') as typeof import('../src/lib/auth');
const { useAppStore } = require('../src/lib/store.ts') as typeof import('../src/lib/store');

let fails = 0;
const check = (l: string, c: boolean, e = '') => {
  if (!c) fails++;
  console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  → ' + e : ''}`);
};
const st = () => useAppStore.getState();
const meal = (id: string) => ({ id, at: '2026-09-29T08:00:00.000Z', items: [{ name: id, calories: 100, protein: 5, carbs: 10, fat: 2 }], mealType: 'lunch' }) as never;
const cloudMeals = (uid: string) => ((fake.rows.get(uid)?.data as { meals?: { id: string }[] })?.meals ?? []).map((m) => m.id);
const signIn = async (uid: string) => {
  fake.uid = uid;
  const outcome = await syncAuthIdentity();
  st().setAccount({ name: uid, email: `${uid}@example.com`, provider: 'email' } as never);
  return outcome;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── A guest's logs are adopted by their first account ──
st().setLanguage('ar');
st().setAccount({ name: 'Guest', provider: 'guest' } as never);
useAppStore.setState({ profile: { name: 'Guest' } as never, meals: [meal('guest-1')] });
st().signOut(); // Profile → Back up: to the sign-in screen, logs kept
check('guest logs start with no owner', st().dataOwner === null);
check('a guest signing in to an empty account uploads their logs', (await signIn('A')) === 'uploaded' && cloudMeals('A').join() === 'guest-1');
check('the phone now belongs to A', st().dataOwner === 'A');

// ── Logging out backs up the latest change, then clears the phone ──
st().logMeal([{ name: 'late', calories: 50, protein: 1, carbs: 1, fat: 1 } as never]);
check('logging out succeeds online', (await logOut()) === 'done');
check('the change made just before logging out reached the account', cloudMeals('A').length === 2, cloudMeals('A').join());
check('the phone no longer holds the logs', st().meals.length === 0 && st().profile === null);
check('signed out of the account, back to the sign-in screen', st().account === null && fake.uid === null);
check('owner and sync marks are cleared', st().dataOwner === null && st().syncedAt === null && st().linkedRef === null);
check('device preferences stay (language)', st().language === 'ar');
await wait(4500);
check('nothing was uploaded after logging out', cloudMeals('A').length === 2);

// ── Someone else signs in: an empty account stays empty ──
check('B signs in to an empty account: nothing restored or uploaded', (await signIn('B')) === 'none');
check("B's account didn't get A's logs", cloudMeals('B').length === 0);
check("B's phone is empty", st().meals.length === 0);
await logOut();

// ── The old way (logs left on the phone), then another account ──
await signIn('A');
check('A signs back in: history restored', st().meals.length === 2);
st().signOut(); // what "Log out" did before this fix: only the name went
check('A is still recorded as the owner of the logs', st().dataOwner === 'A' && st().meals.length === 2);
check('C signs in to an empty account: nothing uploaded', (await signIn('C')) === 'none');
check("C's account didn't get A's logs", cloudMeals('C').length === 0);
check("A's logs are gone from the phone under C", st().meals.length === 0 && st().profile === null);
check('C is still signed in', st().account?.email === 'C@example.com');
check("A's own backup is untouched", cloudMeals('A').length === 2);
await logOut();

// ── Offline at logout: ask first, keep everything ──
await signIn('A');
st().logMeal([{ name: 'offline', calories: 50, protein: 1, carbs: 1, fat: 1 } as never]);
fake.offline = true;
check('offline logout says the latest changes are not backed up', (await logOut()) === 'unsaved');
check('…and changes nothing', st().meals.length === 3 && st().account !== null && fake.uid === 'A');
check('"Log out anyway" logs out and clears', (await logOut(true)) === 'done' && st().meals.length === 0 && fake.uid === null);
fake.offline = false;

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
