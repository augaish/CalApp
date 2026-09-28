/**
 * Which plan unlocks which feature, decided on the device.
 *
 * The server enforces the AI features itself (a locked request gets a 403);
 * this covers the ones that never reach it — saved schedules, meal plans, the
 * shopping list, trend history — and lets AI screens say so before the person
 * has taken a photo or typed a request.
 *
 * Two rules keep it fair:
 *  - Nothing is locked until the server says locks are on (`locks`), which
 *    the admin does once the store can actually sell a plan.
 *  - Only starting something new is locked. What someone already made — a
 *    recipe, a saved schedule, a program, a reading — stays theirs to open
 *    and use on any plan.
 *
 * Kept free of React Native so the rules can be tested directly.
 */

import type { LockReason } from './api-errors';

export type Plan = 'free' | 'pro' | 'proPlus';

export type Gate =
  | 'recipes'
  | 'mealPlans'
  | 'shopping'
  | 'schedules'
  | 'whoop'
  | 'bodyReading'
  | 'trends'
  | 'program'
  | 'coachDocs';

export interface GateState {
  plan?: Plan;
  locks?: boolean;
  features?: { programs?: number | null; programsUsed?: number };
}

/** Saved schedules a free account can keep. */
export const FREE_SAVED_SCHEDULES = 1;
/** Days of trend history a free account sees. */
export const FREE_TREND_DAYS = 30;

/** The lowest plan that includes a gate, for the "comes with" line. */
export const GATE_TIER: Record<Gate, 'pro' | 'proPlus'> = {
  recipes: 'pro',
  mealPlans: 'pro',
  shopping: 'pro',
  schedules: 'pro',
  whoop: 'pro',
  bodyReading: 'pro',
  trends: 'pro',
  program: 'pro',
  coachDocs: 'proPlus',
};

export interface GateContext {
  /** Saved schedules already kept, for the schedules gate. */
  savedSchedules?: number;
}

export function gateOpen(gate: Gate, s: GateState, ctx: GateContext = {}): boolean {
  if (!s.locks) return true;
  const plan: Plan = s.plan ?? 'free';
  if (plan === 'proPlus') return true;
  switch (gate) {
    case 'coachDocs':
      return false;
    case 'schedules':
      return plan === 'pro' || (ctx.savedSchedules ?? 0) < FREE_SAVED_SCHEDULES;
    case 'program': {
      if (plan !== 'pro') return false;
      const cap = s.features?.programs;
      if (cap === null) return true;
      return (s.features?.programsUsed ?? 0) < (cap ?? 1);
    }
    default:
      return plan === 'pro';
  }
}

/** How many days of history the trend charts may show; null = all of it. */
export function trendDays(s: GateState): number | null {
  return gateOpen('trends', s) ? null : FREE_TREND_DAYS;
}

/** Reasons that only Pro+ answers, so the sheet opens on Pro+. */
export function reasonWantsProPlus(reason: string | undefined, plan: string | undefined): boolean {
  return reason === 'coachDocs' || (reason === 'program' && plan === 'pro');
}

/** The line the sheet leads with when a limit or a lock opened it. */
export function reasonText(
  t: (key: string, values?: Record<string, unknown>) => string,
  reason: LockReason | string,
  used: number,
  limit: number,
): string {
  switch (reason) {
    case 'quota':
      return t('upgrade.quotaHit', { used, limit });
    case 'coach':
      return t('upgrade.coachLocked');
    case 'equipment':
      return t('upgrade.equipmentLocked');
    case 'recipes':
    case 'mealPlans':
    case 'shopping':
    case 'schedules':
    case 'whoop':
    case 'bodyReading':
    case 'trends':
    case 'program':
    case 'coachDocs':
      return t(`membership.locked.${reason}`);
    default:
      return t('upgrade.quotaHit', { used, limit });
  }
}
