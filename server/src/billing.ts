import {
  currentPeriod,
  getOrCreateUser,
  getSetting,
  getUsage,
  getUsageKind,
  recordUsage,
  refundUsage,
  reserveUsage,
  type Reservation,
} from './db.js';

export type { Reservation };

export type Plan = 'free' | 'essentials' | 'pro' | 'proPlus';

/** What Essentials covers: one of these, chosen by the member. */
export type Module = 'food' | 'training';

/** Capabilities and monthly AI allowance for each tier. */
export interface PlanSpec {
  /** Monthly AI actions (meal scan, describe, equipment, coach message). */
  limit: number;
  /** AI coach chat. */
  coach: boolean;
  /** Gym-equipment photo analysis. */
  equipment: boolean;
  /** Use the stronger (more accurate, pricier) model for meal analysis. */
  highAccuracy: boolean;
  /**
   * Optional cap on coach messages inside the shared allowance. Without it a
   * free user could spend the whole month's credits on chat and never try the
   * meal scan — the feature that actually sells the app.
   */
  coachCap?: number;
  /** Programmes the AI may design each month; null = only the allowance limits it. */
  programs: number | null;
  /** Photos and PDFs the coach reads and keeps as memory. */
  coachDocs: boolean;
  /** 'all': Food and Training. 'module': the one the member chose. */
  scope: 'all' | 'module';
}

/**
 * The launch offer, once the admin switches plan locks on (planLocksOn):
 * no permanent free tier — a two-week store trial of Essentials (Food or
 * Training, plus Health) or Pro (everything). Without a plan, records stay
 * viewable and exportable but nothing new is logged and no AI is used.
 * Pro+ is kept for later and not offered; it is Pro with more.
 *
 * With locks off, every plan behaves as before plans had features: all of it
 * open, Free with a small allowance. Limits are editable from the admin page.
 */
export const PLANS: Record<Plan, PlanSpec> = {
  free: { limit: 7, coach: true, equipment: true, highAccuracy: false, coachCap: 3, programs: 0, coachDocs: false, scope: 'all' },
  essentials: { limit: 20, coach: true, equipment: true, highAccuracy: false, programs: 0, coachDocs: false, scope: 'module' },
  pro: { limit: 50, coach: true, equipment: true, highAccuracy: false, programs: 1, coachDocs: true, scope: 'all' },
  proPlus: { limit: 400, coach: true, equipment: true, highAccuracy: true, programs: null, coachDocs: true, scope: 'all' },
};

/**
 * The whole plan as if locks were off: every feature open, as before tiers
 * had features of their own. Used until the store is live.
 */
function unlocked(spec: PlanSpec): PlanSpec {
  return { ...spec, programs: null, coachDocs: true, scope: 'all' };
}

/** Whether per-plan feature locks are enforced. Off until the admin turns it on. */
export async function planLocksOn(): Promise<boolean> {
  const stored = await getSetting<{ on?: unknown }>('plan_locks', {});
  return stored.on === true;
}

/** AI actions a free-trial subscriber gets for the whole trial. */
export const DEFAULT_TRIAL_LIMIT = 50;

export async function trialLimit(): Promise<number> {
  const stored = await getSetting<{ trial?: unknown }>('plan_limits', {});
  const v = stored.trial;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : DEFAULT_TRIAL_LIMIT;
}

/** A plan granted from a store free trial rather than a paid period. */
export function isTrialSource(source: string | null | undefined): boolean {
  return !!source && /:trial$/.test(source);
}

export type Feature =
  | 'meal'
  | 'describe'
  | 'equipment'
  | 'coach'
  | 'bodyReading'
  | 'program'
  | 'recipe'
  | 'coachDocs';

/**
 * What each metered route costs against the monthly allowance. Keyed by the
 * usage *kind* (what gets metered), which is not always the Feature name —
 * the exercise lookup is gated as 'equipment' but metered as 'exercise'.
 *
 * Counting every route as one action is what makes a free tier expensive:
 * designing a whole programme is a long tool-calling conversation costing us
 * many times a single meal photo, so a user could spend their entire month on
 * the one route that loses us the most money. Weighting keeps the cheap,
 * habit-forming actions plentiful and prices the expensive ones honestly.
 *
 * Editable from the admin page without a redeploy, because these are cost
 * hypotheses — the real ratios come from the per-kind spend the usage table
 * already records.
 */
export const DEFAULT_ACTION_WEIGHTS: Record<string, number> = {
  meal: 1,
  describe: 1,
  equipment: 1,
  exercise: 1,
  bodyReading: 1,
  coach: 1,
  program: 5,
  // A full recipe is a long tool call — ingredients with four macros each,
  // plus steps — but nothing like designing a whole week of training and food.
  recipe: 2,
};

/** Admin-overridable per-kind action weights. */
export async function actionWeights(): Promise<Record<string, number>> {
  const stored = await getSetting<Record<string, unknown>>('action_weights', {});
  const out = { ...DEFAULT_ACTION_WEIGHTS };
  for (const kind of Object.keys(out)) {
    const v = stored[kind];
    // A zero-weight route would be free and unbounded; a huge one would lock
    // the feature out entirely. Keep it inside something sane.
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 50) out[kind] = Math.round(v);
  }
  return out;
}

/** What one call to this kind costs, after admin overrides. */
export async function weightFor(kind: string): Promise<number> {
  const weights = await actionWeights();
  return weights[kind] ?? 1;
}

/** Admin-overridable per-plan limits. */
export async function planLimits(): Promise<Record<Plan, number>> {
  const stored = await getSetting<Partial<Record<Plan, number>>>('plan_limits', {});
  const pick = (p: Plan) => (typeof stored[p] === 'number' ? (stored[p] as number) : PLANS[p].limit);
  return { free: pick('free'), essentials: pick('essentials'), pro: pick('pro'), proPlus: pick('proPlus') };
}

// ── Which AI answers, per membership tier ──────────────────────────────────

export type AiProvider = 'deepseek' | 'claude';

/** What each tier's sticker price is, and in which currency it's quoted. */
export interface PlanPrices {
  pro: number;
  proPlus: number;
  currency: string;
  /** Optional yearly price for Pro, shown as the "or NNN/year" line. */
  proYearly: number;
  essentials: number;
  essentialsYearly: number;
}

const DEFAULT_PRICES: PlanPrices = {
  essentials: 19.99,
  essentialsYearly: 149.99,
  pro: 24.99,
  proYearly: 199.99,
  proPlus: 49.99,
  currency: 'SAR',
};

/**
 * Admin-editable prices. These drive what the app SHOWS on its upgrade
 * screen and the dashboard's revenue estimate — they do not and cannot
 * change what a subscriber is actually billed, which is set per product in
 * App Store Connect / Google Play and mirrored by RevenueCat. Change it
 * there first, then match it here so the two agree.
 */
export async function planPrices(): Promise<PlanPrices> {
  const stored = await getSetting<Partial<PlanPrices>>('plan_prices', {});
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : fallback;
  return {
    pro: num(stored.pro, DEFAULT_PRICES.pro),
    proPlus: num(stored.proPlus, DEFAULT_PRICES.proPlus),
    proYearly: num(stored.proYearly, DEFAULT_PRICES.proYearly),
    essentials: num(stored.essentials, DEFAULT_PRICES.essentials),
    essentialsYearly: num(stored.essentialsYearly, DEFAULT_PRICES.essentialsYearly),
    currency: typeof stored.currency === 'string' && stored.currency.trim() ? stored.currency.trim().slice(0, 8) : DEFAULT_PRICES.currency,
  };
}

/**
 * Which model family answers for each membership tier. DeepSeek is the
 * default everywhere it is supported once its key is set — it costs a
 * fraction of Claude for the same answer on these routes — and Claude stays
 * fully configured so a tier can be moved back with one dashboard change and
 * no redeploy. With no DeepSeek key the whole thing collapses to Claude.
 *
 * Every AI route now follows this setting — meal photo, described meal,
 * refine, exercise info, equipment, body readings, coach chat and program
 * design. The one exception is a PDF upload, which goes to Claude whatever
 * the tier says because our DeepSeek client sends images; a photo of the
 * same report follows the tier. See AI_PROVIDER_FIXED_ROUTES in index.ts.
 */
export async function aiProviders(deepseekAvailable: boolean): Promise<Record<Plan, AiProvider>> {
  if (!deepseekAvailable) return { free: 'claude', essentials: 'claude', pro: 'claude', proPlus: 'claude' };
  const stored = await getSetting<Partial<Record<Plan, string>>>('ai_providers', {});
  const pick = (v: unknown): AiProvider => (v === 'claude' ? 'claude' : 'deepseek');
  // Essentials follows Pro until it is given a setting of its own.
  return {
    free: pick(stored.free),
    essentials: pick(stored.essentials ?? stored.pro),
    pro: pick(stored.pro),
    proPlus: pick(stored.proPlus),
  };
}

/** Why a feature is refused: no plan at all, the other module, or a Pro feature. */
export type Need = 'subscribe' | Module | 'pro';

export interface Access {
  plan: Plan;
  spec: PlanSpec;
  used: number;
  limit: number;
  period: string;
  /** What this particular action costs against the allowance. */
  weight: number;
  /** false when the plan does not include the requested feature at all. */
  featureAllowed: boolean;
  /** false when the monthly allowance is spent. */
  withinQuota: boolean;
  /** Plan locks are on, so the spec's feature flags are enforced. */
  locks: boolean;
  /** The plan comes from a store free trial: Pro's features, the trial's allowance. */
  trial: boolean;
  /** The feature this access was checked for, so a refusal can name it. */
  feature: Feature;
  /** Essentials' chosen module (null until chosen, or on other plans). */
  module: Module | null;
  /** What would unlock a refused feature. */
  need?: Need;
}

/** Which part of the app each AI feature belongs to. */
export const FEATURE_AREA: Record<Feature, Module | 'health' | 'general' | 'pro'> = {
  meal: 'food',
  describe: 'food',
  recipe: 'food',
  equipment: 'training',
  bodyReading: 'health',
  coach: 'general',
  program: 'pro',
  coachDocs: 'pro',
};

/**
 * Whether a plan includes a feature, before any monthly ration, and if not,
 * what would. With locks off everything is included, as before plans had
 * features. Essentials covers its own module plus Health and the coach —
 * never the other module's AI, which is what keeps one module from quietly
 * becoming both.
 */
export function featureCheck(
  plan: Plan,
  spec: PlanSpec,
  feature: Feature,
  module: Module | null,
  locks: boolean,
): { ok: true } | { ok: false; need: Need } {
  if (!locks) return { ok: true };
  if (plan === 'free') return { ok: false, need: 'subscribe' };
  const area = FEATURE_AREA[feature];
  if (area === 'pro') {
    const ok = feature === 'program' ? spec.programs === null || spec.programs > 0 : spec.coachDocs;
    return ok ? { ok: true } : { ok: false, need: 'pro' };
  }
  if (area === 'food' || area === 'training') {
    if (spec.scope === 'all' || module === area) return { ok: true };
    return { ok: false, need: area };
  }
  if (feature === 'coach' && !spec.coach) return { ok: false, need: 'pro' };
  return { ok: true };
}

/**
 * The per-kind ration a reservation must respect, in weighted units: the
 * coach's message cap, or the month's programme designs times what one costs.
 */
export function kindCap(spec: PlanSpec, kind: string, weight: number): number | undefined {
  if (kind === 'coach') return spec.coachCap;
  if (kind === 'program' && spec.programs !== null) return spec.programs * weight;
  return undefined;
}

/**
 * Resolve the caller's plan, feature access and remaining allowance.
 *
 * `kind` is the usage kind this call will be metered as, which is normally the
 * feature's own name — pass it only where the two differ. It decides what the
 * action costs, so a 5-credit programme design is refused up front with 3
 * credits left instead of being turned away by reserve() after the UI has
 * already promised it.
 */
export async function checkAccess(
  ref: string | null,
  feature: Feature,
  kind: string = feature,
): Promise<Access> {
  const period = currentPeriod();
  const [limits, locks, trialCap] = await Promise.all([planLimits(), planLocksOn(), trialLimit()]);
  const user = ref ? await getOrCreateUser(ref) : null;
  const plan: Plan = (user?.plan as Plan) ?? 'free';
  const module: Module | null = plan === 'essentials' ? (user?.module ?? null) : null;
  const trial = plan !== 'free' && isTrialSource(user?.planSource);
  // A free trial is a taste of everything: whichever plan it turns into, it
  // opens Pro's features for its two weeks, so people choose having seen it
  // all. The plan itself (what gets charged) is unchanged.
  const featurePlan: Plan = trial && plan === 'essentials' ? 'pro' : plan;
  const base = PLANS[featurePlan] ?? PLANS.free;
  const spec = locks ? base : unlocked(base);
  // No plan with locks on: records stay, the AI does not. A trial has a
  // bounded allowance, so a trial that never converts costs little.
  const planLimit = locks && plan === 'free' ? 0 : (limits[featurePlan] ?? spec.limit);
  const limit = trial ? Math.min(planLimit, trialCap) : planLimit;
  const used = ref ? await getUsage(ref, period) : 0;
  const weight = await weightFor(kind);
  const check = featureCheck(featurePlan, spec, feature, featurePlan === 'essentials' ? module : null, locks);
  let featureAllowed = check.ok;
  let need: Need | undefined = check.ok ? undefined : check.need;
  // A plan may allow a feature but ration it inside the shared allowance.
  const cap = kindCap(spec, kind, weight);
  if (featureAllowed && ref && typeof cap === 'number') {
    const kindUsed = await getUsageKind(ref, kind, period);
    if (kindUsed + weight > cap) {
      featureAllowed = false;
      need = feature === 'program' ? 'pro' : undefined;
    }
  }
  return {
    plan,
    spec,
    used,
    limit,
    period,
    weight,
    featureAllowed,
    // No id means nothing to meter against. The metered routes reject those
    // callers outright; failing closed here too keeps a route that forgets the
    // check from handing out unlimited AI.
    withinQuota: !!ref && used + weight <= limit,
    locks,
    trial,
    feature,
    module,
    need,
  };
}

export async function consume(ref: string | null, kind: string): Promise<void> {
  if (!ref) return;
  await recordUsage(ref, kind, await weightFor(kind));
}

/**
 * Take the action out of the allowance before spending money on it, so
 * concurrent requests cannot overshoot the cap. Refund with `release` if the
 * model call then fails — the user should not pay for our error.
 */
export async function reserve(ref: string, access: Access, kind: string): Promise<Reservation> {
  const weight = await weightFor(kind);
  return reserveUsage(ref, kind, access.limit, kindCap(access.spec, kind, weight), weight);
}

export async function release(ref: string, kind: string): Promise<void> {
  await refundUsage(ref, kind, await weightFor(kind));
}

/** 403 body: the plan does not include this feature. */
export function featureLocked(a: Access) {
  return { error: 'feature_locked', feature: true, what: a.feature, need: a.need ?? null, plan: a.plan, used: a.used, limit: a.limit };
}

/** 402 body: allowance for the month is spent — or too thin for this action,
 * which `cost` lets the app explain rather than just refusing. */
export function quotaError(a: Access) {
  return {
    error: 'quota_exceeded',
    plan: a.plan,
    used: a.used,
    limit: a.limit,
    cost: a.weight,
    period: a.period,
  };
}
