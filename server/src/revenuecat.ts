import type { Plan } from './billing.js';

/**
 * Turning RevenueCat's webhook events into plan changes.
 *
 * The logic is deliberately kept as a pure function so the awkward cases —
 * cancellations, refunds, events arriving out of order — can be tested without
 * a server or a store account.
 *
 * Two rules carry most of the weight:
 *
 *  1. CANCELLATION does not take access away. It means auto-renew was switched
 *     off (or a refund was issued); the customer keeps what they paid for until
 *     the period ends. Revoking here would cut off someone mid-subscription,
 *     which is the classic way to generate angry reviews.
 *
 *  2. `expiration_at_ms` is the source of truth, not the event type. Every
 *     grant carries the expiry with it, so a webhook that never arrives cannot
 *     leave someone on Pro forever — the plan lapses on its own date. A refund
 *     arrives with an expiry in the past and therefore revokes immediately.
 */

export interface RevenueCatEvent {
  type?: string;
  id?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  environment?: string;
  store?: string;
  transferred_to?: string[] | null;
  transferred_from?: string[] | null;
}

export type BillingAction =
  | { kind: 'grant'; ref: string; plan: Plan; until: string | null; note: string }
  | { kind: 'revoke'; ref: string; note: string }
  | { kind: 'ignore'; reason: string };

/** Product / entitlement identifiers that map onto each paid tier. */
export interface PlanMapping {
  pro: string[];
  proPlus: string[];
}

export const DEFAULT_MAPPING: PlanMapping = {
  proPlus: ['proplus', 'pro_plus', 'pro-plus', 'plus'],
  pro: ['pro', 'premium'],
};

/**
 * Which tier an event refers to. Pro+ is checked first because "pro" is a
 * substring of every Pro+ identifier and would otherwise always win.
 */
export function planFor(event: RevenueCatEvent, mapping = DEFAULT_MAPPING): Plan | null {
  const ids = [
    ...(event.entitlement_ids ?? []),
    event.entitlement_id ?? '',
    event.product_id ?? '',
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase().replace(/[\s]/g, ''));
  if (ids.length === 0) return null;
  const hits = (needles: string[]) => ids.some((id) => needles.some((n) => id.includes(n)));
  if (hits(mapping.proPlus)) return 'proPlus';
  if (hits(mapping.pro)) return 'pro';
  return null;
}

/** Events that mean "this person is entitled, until the stated expiry". */
const ENTITLING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  // Access continues through a billing retry; the expiry still governs.
  'BILLING_ISSUE',
  // Auto-renew off, or a refund. Either way the expiry decides — a refund
  // carries a past date and so revokes on its own.
  'CANCELLATION',
]);

/** Events that end access outright. */
const ENDING = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

export function decide(event: RevenueCatEvent, mapping = DEFAULT_MAPPING): BillingAction {
  const type = (event.type ?? '').toUpperCase();
  if (!type) return { kind: 'ignore', reason: 'no_type' };
  if (type === 'TEST') return { kind: 'ignore', reason: 'test_event' };

  const ref = (event.app_user_id ?? '').trim();
  if (!ref) return { kind: 'ignore', reason: 'no_app_user_id' };
  // An anonymous id belongs to a device that never identified itself to us, so
  // there is no account to move. The purchase still lands once the app calls
  // logIn and RevenueCat re-sends under the real id.
  if (ref.startsWith('$RCAnonymousID:')) {
    return { kind: 'ignore', reason: 'anonymous_app_user_id' };
  }

  // A transfer hands the purchase to a different id — the old one loses it.
  if (type === 'TRANSFER') {
    const to = event.transferred_to?.[0];
    const plan = planFor(event, mapping);
    if (to && plan) {
      return {
        kind: 'grant',
        ref: to,
        plan,
        until: msToIso(event.expiration_at_ms),
        note: 'revenuecat:transfer',
      };
    }
    const from = event.transferred_from?.[0];
    if (from) return { kind: 'revoke', ref: from, note: 'revenuecat:transfer_away' };
    return { kind: 'ignore', reason: 'transfer_without_target' };
  }

  if (ENDING.has(type)) {
    return { kind: 'revoke', ref, note: `revenuecat:${type.toLowerCase()}` };
  }

  if (ENTITLING.has(type)) {
    const plan = planFor(event, mapping);
    if (!plan) return { kind: 'ignore', reason: 'unmapped_product' };
    return {
      kind: 'grant',
      ref,
      plan,
      until: msToIso(event.expiration_at_ms),
      note: `revenuecat:${type.toLowerCase()}`,
    };
  }

  // Anything new RevenueCat introduces is left alone rather than guessed at.
  return { kind: 'ignore', reason: `unhandled_type:${type}` };
}

function msToIso(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}
