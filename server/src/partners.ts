/**
 * Partners and what their codes earn.
 *
 * A partner is a person or business given codes to share. Each code can
 * carry, besides the buyer's discount (see promo.ts):
 *
 *  • a commission for its owner — a percentage of every sale it brings in;
 *  • how long that lasts — the first payment only, a number of months from
 *    the first payment, or for as long as the customer keeps paying;
 *  • a link to the code of whoever brought this partner in (the "parent"),
 *    who earns their own percentage of these sales — and, two levels up, the
 *    parent's parent (the "grandparent"), who earns a third.
 *
 * So when X brings Z and Z brings W, a sale through W's code pays W, Z and X,
 * each their own percentage, set on W's code. It never reaches further than
 * two levels up.
 *
 * Money is counted on what actually arrives: the store price less the store's
 * commission and tax, as RevenueCat reports them, in US dollars. Every credit
 * is a ledger line tied to one store transaction, so a refund reverses exactly
 * what that transaction earned and a webhook retried cannot count it twice.
 * Payouts are recorded by hand: the app never sends money anywhere.
 *
 * Everything in this file is pure; the database side lives in db.ts.
 */
import { normalizeCode } from './promo.js';

export type CommissionTerm = 'first' | 'months' | 'lifetime';

/** The part of a code that decides who earns what from its sales. */
export interface CodeEarning {
  code: string;
  partnerId: string | null;
  /** 0–100, the owner's share. */
  commissionPct: number;
  term: CommissionTerm;
  /** Months from the first payment, when `term` is 'months'. */
  termMonths: number | null;
  parentCode: string | null;
  /** 0–100, the parent code owner's share of this code's sales. */
  parentPct: number;
  /** 0–100, the grandparent code owner's share of this code's sales. */
  grandparentPct: number;
}

export interface Partner {
  id: string;
  name: string;
  contact: string | null;
  note: string | null;
  /** Secret for the partner's own read-only page. */
  token: string;
  active: boolean;
  createdAt: string;
}

/** One earning for one partner from one transaction. Level 0 is the code's own owner. */
export interface EarningLine {
  level: 0 | 1 | 2;
  partnerId: string;
  /** The code the partner earns through (theirs), for reporting. */
  viaCode: string;
  pct: number;
  amountUsd: number;
}

/** Days a sale stays "pending" before it counts as owed: the store refund window. */
export const HOLD_DAYS = 30;

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What a store transaction actually brings in, in USD, or null when it brings
 * nothing (a free trial, a zero-price event). A refund comes back negative.
 *
 * RevenueCat reports `price` in USD with the store's `commission_percentage`
 * and the `tax_percentage` withheld — both fractions of the price. Older
 * payloads may only carry `takehome_percentage`. With none of them we assume
 * the small-business store fee (15%) and flag the figure as estimated.
 */
export function netRevenue(event: {
  price?: unknown;
  commission_percentage?: unknown;
  tax_percentage?: unknown;
  takehome_percentage?: unknown;
}): { usd: number; estimated: boolean } | null {
  const price = Number(event.price);
  if (!Number.isFinite(price) || price === 0) return null;
  const frac = (v: unknown) => {
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
  };
  const commission = frac(event.commission_percentage);
  const tax = frac(event.tax_percentage);
  if (commission != null || tax != null) {
    return { usd: cents(price * Math.max(0, 1 - (commission ?? 0) - (tax ?? 0))), estimated: false };
  }
  const takehome = frac(event.takehome_percentage);
  if (takehome != null) return { usd: cents(price * takehome), estimated: false };
  return { usd: cents(price * 0.85), estimated: true };
}

/**
 * Whether a sale still earns commission under a code's term, given when the
 * customer's first credited sale happened (null: this is the first).
 */
export function withinTerm(
  term: CommissionTerm,
  termMonths: number | null,
  firstSaleAt: string | null,
  saleAt: Date,
): boolean {
  if (!firstSaleAt) return true;
  if (term === 'lifetime') return true;
  if (term === 'first') return false;
  const end = new Date(firstSaleAt);
  end.setUTCMonth(end.getUTCMonth() + Math.max(0, termMonths ?? 0));
  return saleAt.getTime() < end.getTime();
}

/**
 * Split one sale's net revenue across the code's owner and up to two levels
 * of the partners who brought them. `chain` is the sold code followed by its
 * parent and grandparent codes, as far as they exist. Partners that are
 * missing or switched off earn nothing; the others are unaffected.
 */
export function splitSale(
  netUsd: number,
  chain: { code: CodeEarning; partner: Pick<Partner, 'id' | 'active'> | null }[],
): EarningLine[] {
  const sold = chain[0]?.code;
  if (!sold) return [];
  const pcts = [sold.commissionPct, sold.parentPct, sold.grandparentPct];
  const lines: EarningLine[] = [];
  chain.slice(0, 3).forEach((link, level) => {
    const pct = pcts[level] ?? 0;
    if (!link.partner || !link.partner.active || !(pct > 0)) return;
    const amountUsd = cents((netUsd * pct) / 100);
    if (amountUsd === 0) return;
    lines.push({ level: level as 0 | 1 | 2, partnerId: link.partner.id, viaCode: link.code.code, pct, amountUsd });
  });
  return lines;
}

/** Store events that are money coming in. */
export function isSaleEvent(type: string | undefined): boolean {
  return ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'].includes((type ?? '').toUpperCase());
}

/** Store events that hand money back: a refund, which RevenueCat sends as a cancellation by support. */
export function isRefundEvent(event: { type?: string; cancel_reason?: string | null; price?: unknown }): boolean {
  const type = (event.type ?? '').toUpperCase();
  if (type !== 'CANCELLATION') return false;
  return (event.cancel_reason ?? '').toUpperCase() === 'CUSTOMER_SUPPORT' || Number(event.price) < 0;
}

/** A partner's money, split by where it stands. Amounts in USD. */
export interface PartnerBalance {
  earned: number;
  /** Earned in the last HOLD_DAYS — can still be refunded. */
  pending: number;
  paid: number;
  /** Earned before the hold, less what has been paid. Never below zero. */
  owed: number;
}

export function balance(
  lines: { amountUsd: number; at: string }[],
  payouts: { amountUsd: number }[],
  now: Date = new Date(),
): PartnerBalance {
  const cutoff = now.getTime() - HOLD_DAYS * 86_400_000;
  let earned = 0;
  let settled = 0;
  for (const l of lines) {
    earned += l.amountUsd;
    if (new Date(l.at).getTime() <= cutoff) settled += l.amountUsd;
  }
  return balanceFromTotals(earned, settled, payouts.reduce((s, p) => s + p.amountUsd, 0));
}

/** The same, from totals the database already summed: all earnings, those past the hold, payouts. */
export function balanceFromTotals(earned: number, settled: number, paid: number): PartnerBalance {
  return {
    earned: cents(earned),
    pending: cents(earned - settled),
    paid: cents(paid),
    owed: cents(Math.max(0, settled - paid)),
  };
}

// ── Admin input ──────────────────────────────────────────────────────────

export interface CleanPartner {
  name: string;
  contact: string | null;
  note: string | null;
  active: boolean;
}

const text = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

export function cleanPartner(input: Record<string, unknown>): { ok: true; value: CleanPartner } | { ok: false; error: string } {
  const name = text(input.name, 80);
  if (!name) return { ok: false, error: 'name_required' };
  return {
    ok: true,
    value: {
      name,
      contact: text(input.contact, 120),
      note: text(input.note, 300),
      active: input.active === undefined ? true : !!input.active,
    },
  };
}

const pctOf = (v: unknown): number | null | undefined => {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
};

/**
 * The earning side of a code as the admin console sent it, checked against
 * the codes that already exist (for the link). Returns the fields to store or
 * an error naming what is wrong.
 */
export function cleanEarning(
  code: string,
  input: Record<string, unknown>,
  lookup: (code: string) => { partnerId: string | null; parentCode: string | null } | null,
): { ok: true; value: Omit<CodeEarning, 'code'> } | { ok: false; error: string } {
  const partnerId = text(input.partnerId, 40);
  const commission = pctOf(input.commissionPct);
  const parentPctIn = pctOf(input.parentPct);
  const grandPctIn = pctOf(input.grandparentPct);
  if (commission === undefined || parentPctIn === undefined || grandPctIn === undefined) {
    return { ok: false, error: 'percent_out_of_range' };
  }
  const term: CommissionTerm = input.term === 'first' || input.term === 'months' ? input.term : 'lifetime';
  let termMonths: number | null = null;
  if (term === 'months') {
    const m = Math.round(Number(input.termMonths));
    if (!Number.isFinite(m) || m < 1 || m > 120) return { ok: false, error: 'months_out_of_range' };
    termMonths = m;
  }

  const parentRaw = text(input.parentCode, 40);
  const parentCode = parentRaw ? normalizeCode(parentRaw) : null;
  let parentPct = parentPctIn ?? 0;
  let grandparentPct = grandPctIn ?? 0;
  if (parentCode) {
    if (parentCode === code) return { ok: false, error: 'link_to_itself' };
    const parent = lookup(parentCode);
    if (!parent) return { ok: false, error: 'parent_not_found' };
    if (!parent.partnerId) return { ok: false, error: 'parent_has_no_partner' };
    // Two levels up is the limit; a loop back to this code would pay its own
    // owner twice for one sale.
    if (parent.parentCode === code) return { ok: false, error: 'link_loop' };
    if (!parent.parentCode) grandparentPct = 0;
  } else {
    parentPct = 0;
    grandparentPct = 0;
  }
  const owner = partnerId ? (commission ?? 0) : 0;
  if (owner + parentPct + grandparentPct > 100) return { ok: false, error: 'shares_over_100' };

  return {
    ok: true,
    value: { partnerId, commissionPct: owner, term, termMonths, parentCode, parentPct, grandparentPct },
  };
}
