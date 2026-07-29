import { currentPeriod, getOrCreateUser, getSetting, getUsage, recordUsage } from './db.js';

export type Plan = 'free' | 'pro' | 'proPlus';

/** Capabilities and monthly AI allowance for each tier. */
export interface PlanSpec {
  /** Monthly AI actions (meal scan, describe, equipment, coach message). */
  limit: number;
  /** AI coach chat. The most token-hungry feature, so it is Pro and above. */
  coach: boolean;
  /** Gym-equipment photo analysis. */
  equipment: boolean;
  /** Use the stronger (more accurate, pricier) model for meal analysis. */
  highAccuracy: boolean;
}

/**
 * Free deliberately keeps a small AI allowance rather than zero: users need to
 * feel the scan work before they will pay for it. Everything that costs real
 * money at volume — the coach, high-accuracy analysis, big allowances — sits
 * behind Pro. Limits are editable from the admin page without a redeploy.
 */
export const PLANS: Record<Plan, PlanSpec> = {
  free: { limit: 10, coach: false, equipment: false, highAccuracy: false },
  pro: { limit: 150, coach: true, equipment: true, highAccuracy: false },
  proPlus: { limit: 500, coach: true, equipment: true, highAccuracy: true },
};

export type Feature = 'meal' | 'describe' | 'equipment' | 'coach';

/** Admin-overridable per-plan limits. */
export async function planLimits(): Promise<Record<Plan, number>> {
  const stored = await getSetting<Partial<Record<Plan, number>>>('plan_limits', {});
  return {
    free: typeof stored.free === 'number' ? stored.free : PLANS.free.limit,
    pro: typeof stored.pro === 'number' ? stored.pro : PLANS.pro.limit,
    proPlus: typeof stored.proPlus === 'number' ? stored.proPlus : PLANS.proPlus.limit,
  };
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
  const featureAllowed =
    feature === 'coach' ? spec.coach : feature === 'equipment' ? spec.equipment : true;
  return {
    plan,
    spec,
    used,
    limit,
    period,
    featureAllowed,
    // Without an identified caller we cannot meter, so do not block.
    withinQuota: !ref || used < limit,
  };
}

export async function consume(ref: string | null, kind: string): Promise<void> {
  if (!ref) return;
  await recordUsage(ref, kind);
}

/** 403 body: the plan does not include this feature. */
export function featureLocked(a: Access) {
  return { error: 'feature_locked', feature: true, plan: a.plan, used: a.used, limit: a.limit };
}

/** 402 body: allowance for the month is spent. */
export function quotaError(a: Access) {
  return { error: 'quota_exceeded', plan: a.plan, used: a.used, limit: a.limit, period: a.period };
}
