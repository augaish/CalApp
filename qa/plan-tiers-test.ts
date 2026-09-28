// Free / Pro / Pro+ feature rules: the app's locks, the server's plan specs,
// store free trials, and — with DATABASE_URL — the server's own enforcement
// with plan locks off and on.
import { FREE_SAVED_SCHEDULES, FREE_TREND_DAYS, gateOpen, trendDays, type Gate } from '/home/user/CalApp/src/lib/plan-gates.ts';
import { FeatureLockedError, aiFailureAction, lockReason } from '/home/user/CalApp/src/lib/api-errors.ts';
import { freeTrialDays } from '/home/user/CalApp/src/lib/store-plans.ts';
import { reasonText, reasonWantsProPlus } from '/home/user/CalApp/src/lib/plan-gates.ts';
import { PLANS, featureInPlan, isTrialSource, kindCap } from '/home/user/CalApp/server/src/billing.ts';
import { decide, planFromSubscriber } from '/home/user/CalApp/server/src/revenuecat.ts';
import { en } from '/home/user/CalApp/src/lib/locales/en.ts';
import { ar } from '/home/user/CalApp/src/lib/locales/ar.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ── app locks ──
const ALL: Gate[] = ['recipes', 'mealPlans', 'shopping', 'schedules', 'whoop', 'bodyReading', 'trends', 'program', 'coachDocs'];
check('locks off: every gate open on free', ALL.every((g) => gateOpen(g, { plan: 'free', locks: false })));
check('locks unknown (older server): every gate open', ALL.every((g) => gateOpen(g, { plan: 'free' })));
check('locks on: Pro+ opens everything', ALL.every((g) => gateOpen(g, { plan: 'proPlus', locks: true })));

const free = { plan: 'free' as const, locks: true };
check('free: recipes, meal plans, shopping, WHOOP, body reading, trends, program all locked',
  (['recipes', 'mealPlans', 'shopping', 'whoop', 'bodyReading', 'trends', 'program'] as Gate[]).every((g) => !gateOpen(g, free)));
check('free: coach memory locked', !gateOpen('coachDocs', free));
eq('free keeps one saved schedule', FREE_SAVED_SCHEDULES, 1);
check('free: first saved schedule allowed', gateOpen('schedules', free, { savedSchedules: 0 }));
check('free: a second saved schedule is locked', !gateOpen('schedules', free, { savedSchedules: 1 }));
eq('free trends are capped at 30 days', trendDays(free), FREE_TREND_DAYS);
eq('free trend cap is 30', FREE_TREND_DAYS, 30);

const pro = { plan: 'pro' as const, locks: true, features: { programs: 1, programsUsed: 0 } };
check('pro: recipes, meal plans, shopping, WHOOP, body reading, trends open',
  (['recipes', 'mealPlans', 'shopping', 'whoop', 'bodyReading', 'trends'] as Gate[]).every((g) => gateOpen(g, pro)));
check('pro: any number of saved schedules', gateOpen('schedules', pro, { savedSchedules: 12 }));
eq('pro sees all trend history', trendDays(pro), null);
check('pro: one program a month is open', gateOpen('program', pro));
check('pro: the second program of the month is locked', !gateOpen('program', { ...pro, features: { programs: 1, programsUsed: 1 } }));
check('pro: an older server without the count still allows one', gateOpen('program', { plan: 'pro', locks: true }));
check('pro: coach memory is Pro+ only', !gateOpen('coachDocs', pro));

// ── server plan specs ──
eq('allowances are 7 / 50 / 400', [PLANS.free.limit, PLANS.pro.limit, PLANS.proPlus.limit], [7, 50, 400]);
eq('free coach cap is 3', PLANS.free.coachCap, 3);
eq('programs a month: 0 / 1 / unlimited', [PLANS.free.programs, PLANS.pro.programs, PLANS.proPlus.programs], [0, 1, null]);
check('free plan has no AI recipes, body reading, program or coach memory',
  !featureInPlan(PLANS.free, 'recipe') && !featureInPlan(PLANS.free, 'bodyReading') && !featureInPlan(PLANS.free, 'program') && !featureInPlan(PLANS.free, 'coachDocs'));
check('free keeps meal scan, describe, equipment and the coach',
  (['meal', 'describe', 'equipment', 'coach'] as const).every((f) => featureInPlan(PLANS.free, f)));
check('pro has recipes, body reading and a program, not coach memory',
  featureInPlan(PLANS.pro, 'recipe') && featureInPlan(PLANS.pro, 'bodyReading') && featureInPlan(PLANS.pro, 'program') && !featureInPlan(PLANS.pro, 'coachDocs'));
check('pro+ has everything', (['meal', 'describe', 'equipment', 'coach', 'recipe', 'bodyReading', 'program', 'coachDocs'] as const).every((f) => featureInPlan(PLANS.proPlus, f)));
eq('pro program ration is one design at its weight', kindCap(PLANS.pro, 'program', 5), 5);
eq('pro+ program has no ration', kindCap(PLANS.proPlus, 'program', 5), undefined);
eq('coach ration is the coach cap', kindCap(PLANS.free, 'coach', 1), 3);
eq('meal scans have no ration of their own', kindCap(PLANS.free, 'meal', 1), undefined);
check('only Pro+ reads with the accurate model', !PLANS.free.highAccuracy && !PLANS.pro.highAccuracy && PLANS.proPlus.highAccuracy);

// ── store free trials ──
const trialEvent = decide({ type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: 'calgym_proplus_yearly', period_type: 'TRIAL', expiration_at_ms: Date.now() + 7 * 864e5 });
eq('a trial start is marked as a trial', trialEvent.kind === 'grant' ? trialEvent.note : null, 'revenuecat:initial_purchase:trial');
const paid = decide({ type: 'RENEWAL', app_user_id: 'u1', product_id: 'calgym_proplus_yearly', period_type: 'NORMAL', expiration_at_ms: Date.now() + 365 * 864e5 });
eq('the first paid renewal is not a trial', paid.kind === 'grant' ? paid.note : null, 'revenuecat:renewal');
check('trial source is recognised', isTrialSource('revenuecat:initial_purchase:trial') && isTrialSource('revenuecat:sync:trial'));
check('paid and admin sources are not trials', !isTrialSource('revenuecat:renewal') && !isTrialSource('admin') && !isTrialSource(null));
const later = new Date(Date.now() + 5 * 864e5).toISOString();
const sub = planFromSubscriber({
  subscriber: {
    entitlements: { pro_plus: { expires_date: later, product_identifier: 'calgym_proplus_yearly' } },
    subscriptions: { calgym_proplus_yearly: { period_type: 'trial' } },
  },
});
eq('the subscriber record reports a trial', sub && { plan: sub.plan, trial: sub.trial }, { plan: 'proPlus', trial: true });
const subPaid = planFromSubscriber({
  subscriber: {
    entitlements: { pro: { expires_date: later, product_identifier: 'calgym_pro_monthly' } },
    subscriptions: { calgym_pro_monthly: { period_type: 'normal' } },
  },
});
eq('a paid subscriber record is not a trial', subPaid?.trial, false);

const pkg = (intro: unknown) => ({ identifier: 'x', packageType: 'ANNUAL', product: { identifier: 'p', priceString: '', price: 1, currencyCode: 'SAR', introPrice: intro as never } });
eq('a 7-day free intro is 7 days', freeTrialDays(pkg({ price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 })), 7);
eq('a 1-week free intro is 7 days', freeTrialDays(pkg({ price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 })), 7);
eq('a discounted intro is not a free trial', freeTrialDays(pkg({ price: 9.99, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 })), null);
eq('no intro, no trial', freeTrialDays(pkg(null)), null);

// ── lock reasons ──
eq('a locked program names the program', lockReason(new FeatureLockedError('free', 'program')), 'program');
eq('a locked AI recipe names recipes', lockReason(new FeatureLockedError('free', 'recipe')), 'recipes');
eq('locked coach memory names it', lockReason(new FeatureLockedError('pro', 'coachDocs')), 'coachDocs');
eq('an older server (no name) still reads as the coach', lockReason(new FeatureLockedError('free')), 'coach');
eq('aiFailureAction carries the reason', aiFailureAction(new FeatureLockedError('free', 'bodyReading'), { titleKey: 'a', bodyKey: 'b' }), { kind: 'upgrade', reason: 'bodyReading' });
check('coach memory opens the sheet on Pro+', reasonWantsProPlus('coachDocs', 'free'));
check('a Pro member out of programs is offered Pro+', reasonWantsProPlus('program', 'pro'));
check('a free member locked out of programs starts on Pro', !reasonWantsProPlus('program', 'free'));

// Every reason has its text in both languages.
const lookup = (dict: Record<string, unknown>) => (key: string) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
  return typeof v === 'string' ? v : `MISSING:${key}`;
};
for (const [lang, dict] of [['en', en], ['ar', ar]] as const) {
  const t = lookup(dict as unknown as Record<string, unknown>);
  const missing = [...ALL, 'quota', 'coach', 'equipment'].map((r) => reasonText(t, r, 7, 7)).filter((s) => s.startsWith('MISSING'));
  eq(`${lang}: every lock reason has text`, missing, []);
  const keys = ['upgrade.startTrial', 'upgrade.trialTerms', 'upgrade.trialBadge', ...['scan', 'planning', 'schedules', 'program', 'memory', 'accuracy'].flatMap((k) => [`upgrade.features.${k}.title`, `upgrade.features.${k}.body`])];
  eq(`${lang}: trial and feature strings exist`, keys.filter((k) => t(k).startsWith('MISSING')), []);
  check(`${lang}: trial terms state the length, the price after and how to cancel`, /\{\{days\}\}/.test(t('upgrade.trialTerms')) && /\{\{price\}\}/.test(t('upgrade.trialTerms')) && /\{\{store\}\}/.test(t('upgrade.trialTerms')));
}

// ── the server's own enforcement ──
if (process.env.DATABASE_URL) {
  const db = await import('/home/user/CalApp/server/src/db.ts');
  const billing = await import('/home/user/CalApp/server/src/billing.ts');
  await db.initDb();
  const ref = `tier-test-${Date.now()}`;
  await db.setSetting('plan_locks', { on: false });
  await db.setSetting('plan_limits', {});
  let a = await billing.checkAccess(ref, 'program');
  check('locks off: a free account may still design a program', a.featureAllowed && !a.locks);
  a = await billing.checkAccess(ref, 'coachDocs', 'coach');
  check('locks off: coach memory open on free', a.featureAllowed);
  eq('free allowance is 7', a.limit, 7);

  await db.setSetting('plan_locks', { on: true });
  a = await billing.checkAccess(ref, 'program');
  check('locks on: free cannot design a program', !a.featureAllowed && a.locks);
  eq('the refusal names the program', billing.featureLocked(a).what, 'program');
  check('locks on: free cannot use AI recipes', !(await billing.checkAccess(ref, 'recipe')).featureAllowed);
  check('locks on: free cannot read a body report', !(await billing.checkAccess(ref, 'bodyReading')).featureAllowed);
  check('locks on: free still scans meals', (await billing.checkAccess(ref, 'meal')).featureAllowed);

  const proRef = `${ref}-pro`;
  await db.setUserPlan(proRef, 'pro', 'admin', null);
  a = await billing.checkAccess(proRef, 'program');
  check('pro: first program of the month allowed', a.featureAllowed);
  const r1 = await billing.reserve(proRef, a, 'program');
  check('pro: first program reserves', r1.ok);
  a = await billing.checkAccess(proRef, 'program');
  check('pro: second program refused up front', !a.featureAllowed);
  const r2 = await billing.reserve(proRef, { ...a, featureAllowed: true }, 'program');
  check('pro: second program refused by the reservation too', !r2.ok && r2.reason === 'cap');
  check('pro: no coach memory', !(await billing.checkAccess(proRef, 'coachDocs', 'coach')).featureAllowed);
  eq('pro allowance is 50', a.limit, 50);

  const trialRef = `${ref}-trial`;
  await db.setUserPlan(trialRef, 'proPlus', 'revenuecat:initial_purchase:trial', new Date(Date.now() + 7 * 864e5).toISOString());
  a = await billing.checkAccess(trialRef, 'coachDocs', 'coach');
  check('trial: Pro+ features open', a.featureAllowed && a.trial);
  eq('trial: allowance is the trial cap', a.limit, 50);
  await db.setSetting('plan_limits', { trial: 20 });
  eq('trial cap follows the admin setting', (await billing.checkAccess(trialRef, 'meal')).limit, 20);
  await db.setUserPlan(trialRef, 'proPlus', 'revenuecat:renewal', new Date(Date.now() + 365 * 864e5).toISOString());
  eq('after the first paid renewal: full Pro+ allowance', (await billing.checkAccess(trialRef, 'meal')).limit, 400);

  await db.setSetting('plan_locks', { on: false });
  await db.setSetting('plan_limits', {});
  for (const r of [ref, proRef, trialRef]) await db.deleteUser(r).catch(() => {});

} else {
  console.log('SKIP  database checks (no DATABASE_URL)');
}

if (fails > 0) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
