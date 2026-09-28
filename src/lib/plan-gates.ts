/**
 * Which plan unlocks what, decided on the device.
 *
 * The launch offer (once the admin turns plan locks on):
 *  - Essentials covers one module, Food or Training, plus Health.
 *  - Pro covers Food, Training and Health, plus the features that join the
 *    two: the AI program builder and the coach's memory.
 *  - Without a plan, everything recorded stays viewable and exportable, but
 *    nothing new is logged or planned.
 *
 * The server enforces the AI side itself (a refused request names what would
 * unlock it); this covers what never reaches the server — logging, planning,
 * schedules — and lets screens say so before anyone fills in a form.
 *
 * Nothing is locked until the server says locks are on (`locks`), and a
 * module's history is never hidden for good: changing module or plan never
 * deletes anything.
 *
 * Kept free of React Native so the rules can be tested directly.
 */

import type { LockReason } from './api-errors';

export type Plan = 'free' | 'essentials' | 'pro' | 'proPlus';
export type Module = 'food' | 'training';

/** food / training / health: logging and planning in that area. The rest are Pro features. */
export type Gate = Module | 'health' | 'program' | 'coachDocs';

export interface GateState {
  plan?: Plan;
  locks?: boolean;
  /** Essentials' chosen module; null until chosen. */
  module?: Module | null;
  /** In a store free trial, which opens everything whatever plan follows. */
  trial?: boolean;
  features?: { programs?: number | null; programsUsed?: number };
}

/**
 * The plan whose features apply now: a free trial is a taste of everything,
 * so an Essentials trial works as Pro until its first charge. What is billed
 * afterwards is still the plan itself.
 */
export function featurePlan(s: Pick<GateState, 'plan' | 'trial'>): Plan {
  const plan: Plan = s.plan ?? 'free';
  return s.trial && plan === 'essentials' ? 'pro' : plan;
}

export function gateOpen(gate: Gate, s: GateState): boolean {
  if (!s.locks) return true;
  const plan = featurePlan(s);
  if (plan === 'free') return false;
  switch (gate) {
    case 'health':
      return true;
    case 'food':
    case 'training':
      return plan !== 'essentials' || s.module === gate;
    case 'coachDocs':
      return plan !== 'essentials';
    case 'program': {
      if (plan === 'essentials') return false;
      if (plan === 'proPlus') return true;
      const cap = s.features?.programs;
      if (cap === null) return true;
      return (s.features?.programsUsed ?? 0) < (cap ?? 1);
    }
  }
}

/** What the membership sheet should say about a closed gate. */
export function lockReasonFor(gate: Gate, s: GateState): LockReason {
  if (s.locks && (s.plan ?? 'free') === 'free') return 'subscribe';
  return gate === 'health' ? 'subscribe' : gate;
}

/**
 * Which modules Overview and the Add menu show. Essentials shows its own;
 * everyone else sees both (without a plan, both are there to look back on).
 * `chooseModule` is an Essentials member who hasn't picked one yet.
 */
export function visibleModules(s: GateState): { food: boolean; training: boolean; chooseModule: boolean } {
  if (!s.locks || featurePlan(s) !== 'essentials') return { food: true, training: true, chooseModule: false };
  if (!s.module) return { food: false, training: false, chooseModule: true };
  return { food: s.module === 'food', training: s.module === 'training', chooseModule: false };
}

/** Whether this state is "no plan with locks on": records are read-only. */
export function readOnly(s: GateState): boolean {
  return !!s.locks && (s.plan ?? 'free') === 'free';
}

/**
 * Which paid choice fits a focus: one area is Essentials for it, both is Pro.
 * Onboarding's Food / Training choice feeds this, so the sheet opens on the
 * plan the person already said they wanted.
 */
export type Choice = 'food' | 'training' | 'both';
export function choiceFor(focus: readonly string[]): Choice {
  const food = focus.includes('food');
  const training = focus.includes('training');
  if (food && !training) return 'food';
  if (training && !food) return 'training';
  return 'both';
}

/**
 * The sheet's starting choice for a reason: a locked module on Essentials is
 * an upgrade to both; a Pro feature is Pro; otherwise the person's focus.
 */
export function choiceForReason(reason: string | undefined, s: GateState, focus: readonly string[]): Choice {
  const plan = s.plan ?? 'free';
  if (reason === 'program' || reason === 'coachDocs') return 'both';
  if ((reason === 'food' || reason === 'training') && plan === 'essentials') return 'both';
  if ((reason === 'food' || reason === 'training') && plan === 'free') {
    const c = choiceFor(focus);
    return c === 'both' ? 'both' : reason;
  }
  return choiceFor(focus);
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
    case 'subscribe':
    case 'food':
    case 'training':
    case 'program':
    case 'coachDocs':
      return t(`membership.locked.${reason}`);
    default:
      return t('upgrade.quotaHit', { used, limit });
  }
}

/** Days before a trial ends that its reminder comes. */
export const TRIAL_REMINDER_DAYS = 2;

/**
 * When to remind someone that their free trial becomes a paid subscription:
 * two days before it ends, or null when that moment has passed or there is
 * no trial.
 */
export function trialReminderAt(until: string | null | undefined, now: Date = new Date()): Date | null {
  if (!until) return null;
  const end = Date.parse(until);
  if (!Number.isFinite(end)) return null;
  const at = end - TRIAL_REMINDER_DAYS * 86400000;
  return at > now.getTime() + 60000 ? new Date(at) : null;
}

/** The first day of the month after a 'YYYY-MM' period, when the allowance resets. */
export function periodResetsOn(period: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)).toISOString();
}

/** The locale key naming a plan: 'Pro', 'Essentials · Food', 'No plan'… */
export function planLabelKey(plan: Plan, locks: boolean | undefined, module: Module | null | undefined): string {
  if (plan === 'essentials') return module ? `plans.name.essentials_${module}` : 'plans.name.essentials';
  if (plan === 'free') return locks ? 'plans.name.none' : 'plans.name.free';
  return `plans.name.${plan}`;
}

/** Kinds in the order the breakdown lists them. */
export const USAGE_KINDS = ['meal', 'describe', 'recipe', 'equipment', 'exercise', 'bodyReading', 'coach', 'program'] as const;

/**
 * This month's use as rows: how many times each kind was used and how many
 * actions that took (a program counts 5, a recipe 2). Unknown kinds are
 * dropped rather than shown with a raw id.
 */
export function usageRows(
  usage: Record<string, number>,
  weights: Record<string, number>,
): { kind: (typeof USAGE_KINDS)[number]; actions: number; times: number; weight: number }[] {
  return USAGE_KINDS.filter((k) => (usage[k] ?? 0) > 0).map((kind) => {
    const actions = usage[kind] ?? 0;
    const weight = Math.max(1, weights[kind] ?? 1);
    return { kind, actions, times: Math.round(actions / weight), weight };
  });
}
