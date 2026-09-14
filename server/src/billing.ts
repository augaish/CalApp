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

export type Plan = 'free' | 'pro' | 'proPlus';

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
}

/**
 * Free can try EVERY feature, just a little of it: experiencing the coach and
 * the equipment scan is what converts, and the monthly action cap already
 * bounds the cost. Paid tiers buy volume (and higher accuracy), not access.
 * Limits are editable from the admin page without a redeploy.
 */
export const PLANS: Record<Plan, PlanSpec> = {
  free: { limit: 15, coach: true, equipment: true, highAccuracy: false, coachCap: 5 },
  pro: { limit: 150, coach: true, equipment: true, highAccuracy: false },
  proPlus: { limit: 500, coach: true, equipment: true, highAccuracy: true },
};

export type Feature = 'meal' | 'describe' | 'equipment' | 'coach' | 'bodyReading' | 'program';

/** Admin-overridable per-plan limits. */
export async function planLimits(): Promise<Record<Plan, number>> {
  const stored = await getSetting<Partial<Record<Plan, number>>>('plan_limits', {});
  return {
    free: typeof stored.free === 'number' ? stored.free : PLANS.free.limit,
    pro: typeof stored.pro === 'number' ? stored.pro : PLANS.pro.limit,
    proPlus: typeof stored.proPlus === 'number' ? stored.proPlus : PLANS.proPlus.limit,
  };
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
}

const DEFAULT_PRICES: PlanPrices = { pro: 13, proPlus: 25, proYearly: 129, currency: 'SAR' };

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
 * Only routes DeepSeek can actually serve consult this (meal photo,
 * described meal, refine, exercise info, equipment). Body readings, coach
 * chat, coach attachments and program design are pinned to Claude for
 * technical reasons — see AI_PROVIDER_FIXED_ROUTES in index.ts.
 */
export async function aiProviders(deepseekAvailable: boolean): Promise<Record<Plan, AiProvider>> {
  if (!deepseekAvailable) return { free: 'claude', pro: 'claude', proPlus: 'claude' };
  const stored = await getSetting<Partial<Record<Plan, string>>>('ai_providers', {});
  const pick = (v: unknown): AiProvider => (v === 'claude' ? 'claude' : 'deepseek');
  return { free: pick(stored.free), pro: pick(stored.pro), proPlus: pick(stored.proPlus) };
}

export interface Access {
  plan: Plan;
  spec: PlanSpec;
  used: number;
  limit: number;
  period: string;
  /** false when the plan does not include the requested feature at all. */
  featureAllowed: boolean;
  /** false when the monthly allowance is spent. */
  withinQuota: boolean;
}

/** Resolve the caller's plan, feature access and remaining allowance. */
export async function checkAccess(ref: string | null, feature: Feature): Promise<Access> {
  const period = currentPeriod();
  const limits = await planLimits();
  const user = ref ? await getOrCreateUser(ref) : null;
  const plan: Plan = (user?.plan as Plan) ?? 'free';
  const spec = PLANS[plan] ?? PLANS.free;
  const limit = limits[plan] ?? spec.limit;
  const used = ref ? await getUsage(ref, period) : 0;
  let featureAllowed =
    feature === 'coach' ? spec.coach : feature === 'equipment' ? spec.equipment : true;
  // A plan may allow the coach but ration it inside the shared allowance.
  if (featureAllowed && feature === 'coach' && ref && typeof spec.coachCap === 'number') {
    const coachUsed = await getUsageKind(ref, 'coach', period);
    if (coachUsed >= spec.coachCap) featureAllowed = false;
  }
  return {
    plan,
    spec,
    used,
    limit,
    period,
    featureAllowed,
    // No id means nothing to meter against. The metered routes reject those
    // callers outright; failing closed here too keeps a route that forgets the
    // check from handing out unlimited AI.
    withinQuota: !!ref && used < limit,
  };
}

export async function consume(ref: string | null, kind: string): Promise<void> {
  if (!ref) return;
  await recordUsage(ref, kind);
}

/**
 * Take the action out of the allowance before spending money on it, so
 * concurrent requests cannot overshoot the cap. Refund with `release` if the
 * model call then fails — the user should not pay for our error.
 */
export async function reserve(ref: string, access: Access, kind: string): Promise<Reservation> {
  const cap = kind === 'coach' ? access.spec.coachCap : undefined;
  return reserveUsage(ref, kind, access.limit, cap);
}

export async function release(ref: string, kind: string): Promise<void> {
  await refundUsage(ref, kind);
}

/** 403 body: the plan does not include this feature. */
export function featureLocked(a: Access) {
  return { error: 'feature_locked', feature: true, plan: a.plan, used: a.used, limit: a.limit };
}

/** 402 body: allowance for the month is spent. */
export function quotaError(a: Access) {
  return { error: 'quota_exceeded', plan: a.plan, used: a.used, limit: a.limit, period: a.period };
}
