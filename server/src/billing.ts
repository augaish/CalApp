import {
  currentPeriod,
  getOrCreateUser,
  getSetting,
  getUsage,
  recordUsage,
  type Plan,
} from './db.js';

/**
 * Monthly AI-action allowances per plan. Every AI call (meal photo, describe,
 * equipment, coach message) counts as one action, so a chatty user can't run up
 * an unbounded bill. Editable from the admin page without a redeploy.
 */
export interface PlanLimits {
  free: number;
  pro: number;
}

/**
 * Pre-launch defaults are deliberately generous: until the paywall ships there
 * is no way for anyone to upgrade, so a tight free cap would just lock testers
 * out. Tighten these from the admin page (Monthly AI allowance) on the day
 * paid plans go live — no redeploy needed.
 */
export const DEFAULT_LIMITS: PlanLimits = { free: 1000, pro: 3000 };

export async function planLimits(): Promise<PlanLimits> {
  const stored = await getSetting<Partial<PlanLimits>>('plan_limits', {});
  return {
    free: typeof stored.free === 'number' ? stored.free : DEFAULT_LIMITS.free,
    pro: typeof stored.pro === 'number' ? stored.pro : DEFAULT_LIMITS.pro,
  };
}

export interface QuotaCheck {
  allowed: boolean;
  plan: Plan;
  used: number;
  limit: number;
  period: string;
}

/**
 * Decide whether `ref` may perform one more AI action. When the database is not
 * configured (local dev) everything is allowed so the server still runs.
 */
export async function checkQuota(ref: string | null): Promise<QuotaCheck> {
  const period = currentPeriod();
  const limits = await planLimits();
  if (!ref) {
    // No caller identity (older app build): allow, but treat as free-tier.
    return { allowed: true, plan: 'free', used: 0, limit: limits.free, period };
  }
  const user = await getOrCreateUser(ref);
  const plan: Plan = user?.plan ?? 'free';
  const limit = plan === 'pro' ? limits.pro : limits.free;
  const used = await getUsage(ref, period);
  return { allowed: used < limit, plan, used, limit, period };
}

/** Count one action against the caller's allowance. */
export async function consume(ref: string | null, kind: string): Promise<void> {
  if (!ref) return;
  await recordUsage(ref, kind);
}

/** Payload returned to the app when the monthly allowance is exhausted. */
export function quotaError(q: QuotaCheck) {
  return {
    error: 'quota_exceeded',
    plan: q.plan,
    used: q.used,
    limit: q.limit,
    period: q.period,
  };
}
