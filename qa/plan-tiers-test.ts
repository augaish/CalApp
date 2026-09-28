// The launch offer: Essentials (Food or Training, plus Health), Pro (both),
// no plan = view-only. App rules, server rules, the coach's scope, store
// trials, usage display — and, with DATABASE_URL, the server's own checks.
import {
  choiceFor, choiceForReason, gateOpen, lockReasonFor, periodResetsOn, planLabelKey, readOnly,
  reasonText, trialReminderAt, usageRows, visibleModules, type Gate,
} from '/home/user/CalApp/src/lib/plan-gates.ts';
import { FeatureLockedError, aiFailureAction, lockReason } from '/home/user/CalApp/src/lib/api-errors.ts';
import { freeTrialDays, groupPackages, tierOf } from '/home/user/CalApp/src/lib/store-plans.ts';
import { PLANS, featureCheck, isTrialSource, kindCap } from '/home/user/CalApp/server/src/billing.ts';
import { coachScopeNote, scopeCoachTools } from '/home/user/CalApp/server/src/coach-actions.ts';
import { decide, planFor, planFromSubscriber } from '/home/user/CalApp/server/src/revenuecat.ts';
import { en } from '/home/user/CalApp/src/lib/locales/en.ts';
import { ar } from '/home/user/CalApp/src/lib/locales/ar.ts';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ── app: what each plan opens ──
const ALL: Gate[] = ['food', 'training', 'health', 'program', 'coachDocs'];
check('locks off: everything open, even with no plan', ALL.every((g) => gateOpen(g, { plan: 'free', locks: false })));
check('older server (no locks field): everything open', ALL.every((g) => gateOpen(g, { plan: 'free' })));

const none = { plan: 'free' as const, locks: true };
check('no plan: nothing new can be recorded', ALL.every((g) => !gateOpen(g, none)));
check('no plan: records are read-only', readOnly(none));
eq('no plan: every lock says start the trial', ALL.map((g) => lockReasonFor(g, none)), ALL.map(() => 'subscribe'));
eq('no plan: both modules stay visible to look back on', visibleModules(none), { food: true, training: true, chooseModule: false });

const food = { plan: 'essentials' as const, locks: true, module: 'food' as const };
check('Essentials Food: food and health open', gateOpen('food', food) && gateOpen('health', food));
check('Essentials Food: training closed', !gateOpen('training', food));
eq('Essentials Food: the training lock names training', lockReasonFor('training', food), 'training');
check('Essentials: no program builder and no coach memory', !gateOpen('program', food) && !gateOpen('coachDocs', food));
eq('Essentials Food: Overview shows only food', visibleModules(food), { food: true, training: false, chooseModule: false });
check('Essentials: not read-only', !readOnly(food));

const training = { plan: 'essentials' as const, locks: true, module: 'training' as const };
check('Essentials Training: training and health open, food closed', gateOpen('training', training) && gateOpen('health', training) && !gateOpen('food', training));
eq('Essentials Training: Overview shows only training', visibleModules(training), { food: false, training: true, chooseModule: false });

const unchosen = { plan: 'essentials' as const, locks: true, module: null };
check('Essentials without a module: neither module until chosen, health open', !gateOpen('food', unchosen) && !gateOpen('training', unchosen) && gateOpen('health', unchosen));
eq('Essentials without a module: asked to choose', visibleModules(unchosen).chooseModule, true);

const pro = { plan: 'pro' as const, locks: true, features: { programs: 1, programsUsed: 0 } };
check('Pro: food, training, health, coach memory', ['food', 'training', 'health', 'coachDocs'].every((g) => gateOpen(g as Gate, pro)));
check('Pro: one program a month', gateOpen('program', pro) && !gateOpen('program', { ...pro, features: { programs: 1, programsUsed: 1 } }));
check('Pro+: everything, programs unlimited', ALL.every((g) => gateOpen(g, { plan: 'proPlus', locks: true, features: { programs: null, programsUsed: 9 } })));

// ── app: which plan the sheet opens on ──
eq('onboarding Food only → Essentials Food', choiceFor(['food']), 'food');
eq('onboarding Training only → Essentials Training', choiceFor(['training']), 'training');
eq('onboarding both → Pro', choiceFor(['food', 'training']), 'both');
eq('nothing chosen → Pro', choiceFor([]), 'both');
eq('Essentials Food locked out of training → Pro (both)', choiceForReason('training', food, ['food']), 'both');
eq('no plan, Food focus, food lock → Essentials Food', choiceForReason('food', none, ['food']), 'food');
eq('program lock → Pro', choiceForReason('program', food, ['food']), 'both');

// ── server: plan specs and feature checks ──
eq('allowances: essentials 20, pro 50, pro+ 400', [PLANS.essentials.limit, PLANS.pro.limit, PLANS.proPlus.limit], [20, 50, 400]);
eq('scope: essentials is one module, the rest all', [PLANS.essentials.scope, PLANS.pro.scope, PLANS.proPlus.scope], ['module', 'all', 'all']);
eq('programs a month: 0 / 1 / unlimited', [PLANS.essentials.programs, PLANS.pro.programs, PLANS.proPlus.programs], [0, 1, null]);
const fc = (plan: 'free' | 'essentials' | 'pro' | 'proPlus', f: Parameters<typeof featureCheck>[2], module: 'food' | 'training' | null, locks = true) =>
  featureCheck(plan, PLANS[plan], f, module, locks);
eq('locks off: free can scan a meal', fc('free', 'meal', null, false), { ok: true });
eq('no plan: meal scan asks to subscribe', fc('free', 'meal', null), { ok: false, need: 'subscribe' });
eq('no plan: the coach asks to subscribe too', fc('free', 'coach', null), { ok: false, need: 'subscribe' });
eq('Essentials Food: meal scan allowed', fc('essentials', 'meal', 'food'), { ok: true });
eq('Essentials Food: AI recipe allowed', fc('essentials', 'recipe', 'food'), { ok: true });
eq('Essentials Food: equipment scan refused, names training', fc('essentials', 'equipment', 'food'), { ok: false, need: 'training' });
eq('Essentials Training: equipment scan allowed', fc('essentials', 'equipment', 'training'), { ok: true });
eq('Essentials Training: meal scan refused, names food', fc('essentials', 'meal', 'training'), { ok: false, need: 'food' });
eq('Essentials Training: described meal refused', fc('essentials', 'describe', 'training'), { ok: false, need: 'food' });
eq('Essentials: body report reading allowed (health)', fc('essentials', 'bodyReading', 'training'), { ok: true });
eq('Essentials: the coach answers (general)', fc('essentials', 'coach', 'food'), { ok: true });
eq('Essentials: program builder is Pro', fc('essentials', 'program', 'food'), { ok: false, need: 'pro' });
eq('Essentials: coach memory is Pro', fc('essentials', 'coachDocs', 'food'), { ok: false, need: 'pro' });
eq('Essentials without module: meal scan refused', fc('essentials', 'meal', null), { ok: false, need: 'food' });
check('Pro: every feature', (['meal', 'describe', 'recipe', 'equipment', 'bodyReading', 'coach', 'program', 'coachDocs'] as const).every((f) => fc('pro', f, null).ok));
eq('Pro program ration is one design at its weight', kindCap(PLANS.pro, 'program', 5), 5);

// ── server: the coach's scope ──
const tools = ['propose_weekly_schedule', 'write_recipe', 'propose_food_log', 'propose_food_update', 'propose_workout_log', 'propose_targets', 'propose_water_log', 'propose_weight_log', 'suggest_follow_ups'].map((name) => ({ name }));
const names = (scope: Parameters<typeof scopeCoachTools>[1]) => scopeCoachTools(tools, scope).map((x) => x.name);
eq('Pro coach keeps every tool', names({ locks: true, spec: { scope: 'all' }, module: null }).length, tools.length);
eq('Essentials Food coach: no schedule or workout tools',
  names({ locks: true, spec: { scope: 'module' }, module: 'food' }),
  ['write_recipe', 'propose_food_log', 'propose_food_update', 'propose_targets', 'propose_water_log', 'propose_weight_log', 'suggest_follow_ups']);
eq('Essentials Training coach: no food, recipe or target tools',
  names({ locks: true, spec: { scope: 'module' }, module: 'training' }),
  ['propose_weekly_schedule', 'propose_workout_log', 'propose_water_log', 'propose_weight_log', 'suggest_follow_ups']);
check('Essentials coach is told its scope, and may answer general questions', /covers food and nutrition/.test(coachScopeNote({ locks: true, spec: { scope: 'module' }, module: 'food' })) && /general questions/.test(coachScopeNote({ locks: true, spec: { scope: 'module' }, module: 'food' })));
eq('Pro coach gets no scope note', coachScopeNote({ locks: true, spec: { scope: 'all' }, module: null }), '');

// ── store products and events ──
const pkg = (identifier: string, packageType: string, productId: string, price: number, extra: Record<string, unknown> = {}) => ({
  identifier, packageType, product: { identifier: productId, priceString: `SAR ${price}`, price, currencyCode: 'SAR', ...extra },
});
eq('essentials product is Essentials', tierOf(pkg('essentials_monthly', 'CUSTOM', 'calgym_essentials_monthly', 19.99)), 'essentials');
eq('pro product is Pro', tierOf(pkg('$rc_monthly', 'MONTHLY', 'calgym_pro_monthly', 24.99)), 'pro');
eq('pro+ product is still Pro+', tierOf(pkg('proplus_monthly', 'CUSTOM', 'calgym_proplus_monthly', 49.99)), 'proPlus');
const grouped = groupPackages([
  pkg('essentials_monthly', 'CUSTOM', 'calgym_essentials_monthly', 19.99, { subscriptionPeriod: 'P1M' }),
  pkg('essentials_annual', 'CUSTOM', 'calgym_essentials_yearly', 149.99, { subscriptionPeriod: 'P1Y' }),
  pkg('$rc_monthly', 'MONTHLY', 'calgym_pro_monthly', 24.99),
  pkg('$rc_annual', 'ANNUAL', 'calgym_pro_yearly', 199.99),
]);
eq('the offering sorts into Essentials and Pro', [grouped.essentials.monthly?.product.identifier, grouped.essentials.annual?.product.identifier, grouped.pro.monthly?.product.identifier, grouped.pro.annual?.product.identifier], ['calgym_essentials_monthly', 'calgym_essentials_yearly', 'calgym_pro_monthly', 'calgym_pro_yearly']);
eq('an Essentials event grants Essentials', planFor({ product_id: 'calgym_essentials_monthly', entitlement_ids: ['essentials'] }), 'essentials');
eq('a Pro event grants Pro', planFor({ product_id: 'calgym_pro_yearly', entitlement_ids: ['pro'] }), 'pro');
const trialStart = decide({ type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: 'calgym_essentials_monthly', entitlement_ids: ['essentials'], period_type: 'TRIAL', expiration_at_ms: Date.now() + 14 * 864e5 });
eq('an Essentials trial start is a trial', trialStart.kind === 'grant' ? [trialStart.plan, trialStart.note] : null, ['essentials', 'revenuecat:initial_purchase:trial']);
check('trial sources recognised', isTrialSource('revenuecat:initial_purchase:trial') && !isTrialSource('revenuecat:renewal'));
const later = new Date(Date.now() + 10 * 864e5).toISOString();
const both = planFromSubscriber({
  subscriber: {
    entitlements: {
      essentials: { expires_date: later, product_identifier: 'calgym_essentials_monthly' },
      pro: { expires_date: later, product_identifier: 'calgym_pro_monthly' },
    },
    subscriptions: { calgym_pro_monthly: { period_type: 'trial' } },
  },
});
eq('holding Essentials and Pro at once: Pro wins', both && [both.plan, both.trial], ['pro', true]);
eq('a 2-week free intro is 14 days', freeTrialDays(pkg('x', 'ANNUAL', 'p', 1, { introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 2, cycles: 1 } })), 14);

// ── lock reasons from the server ──
eq('need subscribe → subscribe', lockReason(new FeatureLockedError('free', 'meal', 'subscribe')), 'subscribe');
eq('need training → training', lockReason(new FeatureLockedError('essentials', 'equipment', 'training')), 'training');
eq('need food → food', lockReason(new FeatureLockedError('essentials', 'meal', 'food')), 'food');
eq('need pro for coach memory → coachDocs', lockReason(new FeatureLockedError('essentials', 'coachDocs', 'pro')), 'coachDocs');
eq('need pro for a program → program', lockReason(new FeatureLockedError('essentials', 'program', 'pro')), 'program');
eq('the coach cap (no need) → coach', lockReason(new FeatureLockedError('free', 'coach', null)), 'coach');
eq('aiFailureAction carries it', aiFailureAction(new FeatureLockedError('essentials', 'meal', 'food'), { titleKey: 'a', bodyKey: 'b' }), { kind: 'upgrade', reason: 'food' });

// ── usage, labels, trial reminder ──
eq('usage rows: times and actions, weighted kinds shown as such',
  usageRows({ meal: 5, program: 10, coach: 3, recipe: 2, nonsense: 4 }, { program: 5, recipe: 2 }),
  [
    { kind: 'meal', actions: 5, times: 5, weight: 1 },
    { kind: 'recipe', actions: 2, times: 1, weight: 2 },
    { kind: 'coach', actions: 3, times: 3, weight: 1 },
    { kind: 'program', actions: 10, times: 2, weight: 5 },
  ]);
eq('September resets on 1 October', periodResetsOn('2026-09'), '2026-10-01T00:00:00.000Z');
eq('December resets on 1 January', periodResetsOn('2026-12'), '2027-01-01T00:00:00.000Z');
eq('labels', [planLabelKey('essentials', true, 'food'), planLabelKey('free', true, null), planLabelKey('free', false, null), planLabelKey('pro', true, null)],
  ['plans.name.essentials_food', 'plans.name.none', 'plans.name.free', 'plans.name.pro']);
const now = new Date('2026-10-01T10:00:00Z');
eq('trial reminder: two days before the end', trialReminderAt('2026-10-15T10:00:00Z', now)?.toISOString(), '2026-10-13T10:00:00.000Z');
eq('trial reminder: none once that moment has passed', trialReminderAt('2026-10-02T10:00:00Z', now), null);
eq('trial reminder: none without a trial', trialReminderAt(null, now), null);

// ── every string exists in both languages ──
const lookup = (dict: Record<string, unknown>) => (key: string) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
  return typeof v === 'string' ? v : `MISSING:${key}`;
};
const KEYS = [
  'plans.helpWith', 'plans.recommended', 'plans.aiPerMonth', 'plans.focusTitle', 'plans.focusRule', 'plans.focusNextChange',
  'plans.readOnlyTitle', 'plans.readOnlyBody', 'plans.trialEnds', 'plans.usedOf', 'plans.leftResets', 'plans.breakdownTitle',
  'plans.timesWeighted', 'plans.keepsNote', 'plans.trialReminderTitle', 'plans.trialReminderBody', 'plans.chooseFocusTitle',
  'plans.changeFocus', 'plans.moduleBanner.food', 'plans.moduleBanner.training', 'plans.upsell.food', 'plans.upsell.training',
  'upgrade.startTrial', 'upgrade.trialTerms', 'upgrade.trialBadge',
  ...['food', 'training', 'both'].flatMap((c) => [`plans.choice.${c}`, ...['a', 'b', 'c', 'd'].map((k) => `plans.includes.${c}.${k}`)]),
  ...['none', 'free', 'essentials', 'essentials_food', 'essentials_training', 'pro', 'proPlus'].map((n) => `plans.name.${n}`),
  ...['meal', 'describe', 'recipe', 'equipment', 'exercise', 'bodyReading', 'coach', 'program'].map((k) => `plans.kinds.${k}`),
];
for (const [lang, dict] of [['en', en], ['ar', ar]] as const) {
  const t = lookup(dict as unknown as Record<string, unknown>);
  eq(`${lang}: every plan string exists`, KEYS.filter((k) => t(k).startsWith('MISSING')), []);
  const reasons = ['subscribe', 'food', 'training', 'program', 'coachDocs', 'quota', 'coach', 'equipment'];
  eq(`${lang}: every lock reason has text`, reasons.map((r) => reasonText(t, r, 7, 20)).filter((x) => x.startsWith('MISSING')), []);
  check(`${lang}: trial terms state length, price after and how to cancel`, ['{{days}}', '{{price}}', '{{store}}'].every((p) => t('upgrade.trialTerms').includes(p)));
}

// ── the server's own checks ──
if (process.env.DATABASE_URL) {
  const db = await import('/home/user/CalApp/server/src/db.ts');
  const billing = await import('/home/user/CalApp/server/src/billing.ts');
  await db.initDb();
  const ref = `tier-${Date.now()}`;
  await db.setSetting('plan_limits', {});
  await db.setSetting('plan_locks', { on: false });
  let a = await billing.checkAccess(ref, 'meal');
  check('locks off: no plan scans with the small allowance', a.featureAllowed && a.limit === 7);

  await db.setSetting('plan_locks', { on: true });
  a = await billing.checkAccess(ref, 'meal');
  check('locks on, no plan: no AI and nothing allowed', !a.featureAllowed && a.limit === 0);
  eq('the refusal says subscribe', billing.featureLocked(a).need, 'subscribe');

  const ess = `${ref}-ess`;
  await db.setUserPlan(ess, 'essentials', 'revenuecat:initial_purchase:trial', new Date(Date.now() + 14 * 864e5).toISOString());
  check('Essentials without module: meal refused until chosen', !(await billing.checkAccess(ess, 'meal')).featureAllowed);
  eq('first choice of module is allowed', await db.setUserModule(ess, 'food'), { ok: true });
  a = await billing.checkAccess(ess, 'meal');
  check('Essentials Food: meal scan allowed, trial allowance 20', a.featureAllowed && a.limit === 20 && a.trial && a.module === 'food');
  a = await billing.checkAccess(ess, 'equipment', 'exercise');
  check('Essentials Food: exercise lookup refused as training', !a.featureAllowed && a.need === 'training');
  const early = await db.setUserModule(ess, 'training');
  check('switching module within 30 days is refused with a date', !early.ok && 'nextChange' in early);
  const monthLater = new Date(Date.now() + 31 * 864e5);
  eq('after 30 days the switch is allowed', await db.setUserModule(ess, 'training', monthLater), { ok: true });
  check('now Essentials Training: equipment allowed, meal refused',
    (await billing.checkAccess(ess, 'equipment')).featureAllowed && !(await billing.checkAccess(ess, 'meal')).featureAllowed);
  const usage = await db.getUsageByKind(ess);
  check('usage by kind starts empty', Object.keys(usage).length === 0);
  const r = await billing.reserve(ess, await billing.checkAccess(ess, 'equipment'), 'equipment');
  check('a reservation counts', r.ok);
  eq('usage by kind shows it', await db.getUsageByKind(ess), { equipment: 1 });

  const proRef = `${ref}-pro`;
  await db.setUserPlan(proRef, 'pro', 'admin', null);
  a = await billing.checkAccess(proRef, 'coachDocs', 'coach');
  check('Pro: coach memory allowed, allowance 50', a.featureAllowed && a.limit === 50);

  await db.setSetting('plan_locks', { on: false });
  for (const x of [ref, ess, proRef]) await db.deleteUser(x).catch(() => {});
} else {
  console.log('SKIP  database checks (no DATABASE_URL)');
}

if (fails > 0) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
