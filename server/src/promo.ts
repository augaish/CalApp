/**
 * Promotion codes.
 *
 * Two kinds, because the app stores allow two different things and it is
 * worth being honest about which is which:
 *
 *  • `free`    — we grant a tier for a number of days at no charge. No money
 *                moves, so this is entirely ours: we set the rules, we count
 *                the redemptions, and we can switch it off mid-campaign.
 *                This is the right tool for press, gyms, coaches and refunds.
 *
 *  • `percent` — a genuine discount on a paid subscription. Apple and Google
 *                will not let anyone else price their products, so the money
 *                side of this lives in an App Store offer code / Play offer
 *                that the store redeems. Our row records the percentage, the
 *                offer identifiers and the campaign limits so the app can
 *                find the right offer from a code the person types, and so
 *                every code lives in one list with one set of counters.
 *
 * Either way the counters here are ours: how many times a code was used, by
 * whom, and when. A code is redeemable once per account, enforced by the
 * primary key on the redemptions table rather than by a read-then-write that
 * two taps could race through.
 */
import type { Plan } from './billing.js';

export type PromoKind = 'free' | 'percent';

export interface PromoCode {
  code: string;
  kind: PromoKind;
  /** The tier the code grants (free) or discounts (percent). */
  plan: Plan;
  /** 1–100. Always 100 for a free code: it is a complete discount. */
  percentOff: number;
  /** How many days a free grant lasts. Null on a percent code. */
  durationDays: number | null;
  /** Store offer identifiers a percent code maps to. Null on a free code. */
  offerIos: string | null;
  offerAndroid: string | null;
  /** Null means unlimited. */
  maxRedemptions: number | null;
  redeemedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
  /** Redemptions a purchase was matched to (percent codes). */
  convertedCount?: number;
}

export type RedeemFailure =
  | 'unknown'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'already_redeemed'
  /** A free code would be wasted: the account already pays for this tier or better. */
  | 'already_subscribed'
  | 'unavailable';

export type RedeemResult =
  | { ok: true; kind: 'free'; code: string; plan: Plan; until: string }
  | {
      ok: true;
      kind: 'percent';
      code: string;
      plan: Plan;
      percentOff: number;
      offerIos: string | null;
      offerAndroid: string | null;
      /** True when this person had already claimed it and is being handed the offer again. */
      again?: boolean;
    }
  | { ok: false; reason: RedeemFailure };

/** Arabic-Indic and Eastern Arabic digits, so a typed code works in either keyboard. */
const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * What a typed code becomes before it is looked up: upper case, Latin
 * digits, and nothing but letters and numbers. Someone reading a code off a
 * poster will add spaces or a dash, and a phone will happily capitalise the
 * first letter only — none of that should decide whether a code works.
 */
export function normalizeCode(raw: string): string {
  return [...(raw ?? '')]
    .map((ch) => DIGITS[ch] ?? ch)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 32);
}

/** Why a code cannot be used right now, or null when it can. Pure. */
export function codeProblem(row: PromoCode, now: Date = new Date()): RedeemFailure | null {
  if (!row.active) return 'inactive';
  if (row.startsAt && new Date(row.startsAt).getTime() > now.getTime()) return 'not_started';
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) return 'expired';
  if (row.maxRedemptions != null && row.redeemedCount >= row.maxRedemptions) return 'exhausted';
  return null;
}

/** How many redemptions are left, or null when a code is unlimited. */
export function remaining(row: PromoCode): number | null {
  return row.maxRedemptions == null ? null : Math.max(0, row.maxRedemptions - row.redeemedCount);
}

export interface PromoDraft {
  code: string;
  kind?: string;
  plan?: string;
  percentOff?: unknown;
  durationDays?: unknown;
  offerIos?: unknown;
  offerAndroid?: unknown;
  maxRedemptions?: unknown;
  startsAt?: unknown;
  expiresAt?: unknown;
  active?: unknown;
  note?: unknown;
}

export interface CleanPromo {
  code: string;
  kind: PromoKind;
  plan: Plan;
  percentOff: number;
  durationDays: number | null;
  offerIos: string | null;
  offerAndroid: string | null;
  maxRedemptions: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  note: string | null;
}

const PLANS: Plan[] = ['free', 'pro', 'proPlus'];

/**
 * Normalise and bound what the admin console sent. Returns the row to store
 * or an error naming the field, so a typo becomes a message rather than a
 * campaign that quietly grants the wrong thing.
 */
export function cleanDraft(input: PromoDraft): { ok: true; value: CleanPromo } | { ok: false; error: string } {
  const code = normalizeCode(input.code ?? '');
  if (code.length < 3) return { ok: false, error: 'code_too_short' };

  const kind: PromoKind = input.kind === 'percent' ? 'percent' : 'free';
  const plan = (PLANS.includes(input.plan as Plan) ? input.plan : 'pro') as Plan;
  if (plan === 'free') return { ok: false, error: 'plan_must_be_paid' };

  const int = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null;
  };

  // A free code is a 100% discount by definition; storing anything else
  // would make the reporting lie about what was given away.
  let percentOff = 100;
  if (kind === 'percent') {
    const p = int(input.percentOff);
    if (p == null || p < 1 || p > 100) return { ok: false, error: 'percent_out_of_range' };
    percentOff = p;
  }

  let durationDays: number | null = null;
  if (kind === 'free') {
    const d = int(input.durationDays) ?? 30;
    if (d < 1 || d > 3650) return { ok: false, error: 'duration_out_of_range' };
    durationDays = d;
  }

  const text = (v: unknown, max = 120): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s.slice(0, max) : null;
  };
  const offerIos = kind === 'percent' ? text(input.offerIos) : null;
  const offerAndroid = kind === 'percent' ? text(input.offerAndroid) : null;
  // Without an offer on at least one store a percent code cannot discount
  // anything, and would fail at the till rather than here.
  if (kind === 'percent' && !offerIos && !offerAndroid) return { ok: false, error: 'offer_required' };

  const max = int(input.maxRedemptions);
  if (max != null && max < 1) return { ok: false, error: 'max_out_of_range' };

  const when = (v: unknown): string | null | undefined => {
    if (v == null || v === '') return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  };
  const startsAt = when(input.startsAt);
  if (startsAt === undefined) return { ok: false, error: 'bad_starts_at' };
  const expiresAt = when(input.expiresAt);
  if (expiresAt === undefined) return { ok: false, error: 'bad_expires_at' };
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
    return { ok: false, error: 'expires_before_starts' };
  }

  return {
    ok: true,
    value: {
      code,
      kind,
      plan,
      percentOff,
      durationDays,
      offerIos,
      offerAndroid,
      maxRedemptions: max,
      startsAt: startsAt ?? null,
      expiresAt: expiresAt ?? null,
      active: input.active === undefined ? true : !!input.active,
      note: text(input.note, 200),
    },
  };
}

export const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, proPlus: 2 };

export interface EffectivePlan {
  plan: Plan;
  source: string;
  until: string | null;
  /** The store/admin grant alone, lapsed to free once out of date. */
  store: { plan: Plan; source: string; until: string | null };
  /** The gift, when one is running. */
  promo: { plan: Plan; until: string; code: string | null } | null;
}

/**
 * The plan a person has: the better of what the store (or an admin) granted
 * and a running promo gift. Pure, so the combinations can be tested without
 * a database. The store grant keeps its own source and dates even while a
 * gift outranks it, so when the gift ends the subscription simply shows
 * through again.
 */
export function effectivePlan(
  store: { plan: Plan; source: string; until: string | null },
  promo: { plan: Plan | null; until: string | null; code: string | null },
  now: Date = new Date(),
): EffectivePlan {
  const lapsed = store.until != null && new Date(store.until).getTime() < now.getTime();
  const storeNow = { plan: lapsed ? ('free' as Plan) : store.plan, source: store.source, until: store.until };
  const promoNow =
    promo.plan && promo.plan !== 'free' && promo.until && new Date(promo.until).getTime() > now.getTime()
      ? { plan: promo.plan, until: promo.until, code: promo.code }
      : null;
  if (promoNow && PLAN_RANK[promoNow.plan] > PLAN_RANK[storeNow.plan]) {
    return {
      plan: promoNow.plan,
      source: `promo:${promoNow.code ?? ''}`,
      until: promoNow.until,
      store: storeNow,
      promo: promoNow,
    };
  }
  return { ...storeNow, store: storeNow, promo: promoNow };
}

/** When a free grant made now would run out. */
export function grantUntil(durationDays: number | null, now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + (durationDays ?? 30));
  return d.toISOString();
}

/**
 * Redeem a typed code for one account.
 *
 * A free code grants the tier immediately and returns when it runs out. A
 * percent code grants nothing here — the discount only exists once the store
 * accepts the matching offer — so it returns the offer identifiers for the
 * app to hand to the store sheet, and the redemption we just counted is the
 * record that this person was given the offer.
 */
export async function redeemPromo(rawCode: string, ref: string): Promise<RedeemResult> {
  const { claimPromo, getOrCreateUser, getPromo, getRedemption, grantPromo } = await import('./db.js');
  const code = normalizeCode(rawCode);
  if (code.length < 3) return { ok: false, reason: 'unknown' };

  const existing = await getPromo(code);
  if (!existing) return { ok: false, reason: 'unknown' };

  const user = await getOrCreateUser(ref);
  let until: string | null = null;
  if (existing.kind === 'free') {
    // Days of a tier someone already pays for would simply be lost, and the
    // redemption counted against the campaign for nothing. Checked before
    // the claim so the code stays unspent for them.
    const paying = user?.storePlan?.plan ?? 'free';
    if (PLAN_RANK[paying] >= PLAN_RANK[existing.plan]) return { ok: false, reason: 'already_subscribed' };
    // A second gift starts where a running one ends, rather than overlapping it.
    const base = user?.promo?.until ? new Date(user.promo.until) : new Date();
    until = grantUntil(existing.durationDays, base.getTime() > Date.now() ? base : new Date());
  }

  const claimed = await claimPromo(code, ref, until);
  if (!claimed) {
    // The gate refused. Re-read to say which rule stopped it: a stale count
    // is better than a blank "no", and the row may have changed in between.
    const now = await getPromo(code);
    if (!now) return { ok: false, reason: 'unknown' };
    // Someone who claimed a discount but backed out of the store sheet may
    // come back for it. They already hold one of the campaign's places, so
    // hand the same offer over again — without counting them twice — as
    // long as the code itself is still live.
    if (now.kind === 'percent') {
      const mine = await getRedemption(code, ref);
      const problem = codeProblem(now);
      if (mine && !mine.convertedAt && (problem === null || problem === 'exhausted')) {
        return { ...percentResult(now), again: true };
      }
    }
    return { ok: false, reason: codeProblem(now) ?? 'already_redeemed' };
  }

  if (claimed.kind === 'free') {
    await grantPromo(ref, claimed.plan, code, until as string);
    return { ok: true, kind: 'free', code, plan: claimed.plan, until: until as string };
  }
  return percentResult(claimed);
}

function percentResult(row: PromoCode): Extract<RedeemResult, { kind: 'percent' }> {
  return {
    ok: true,
    kind: 'percent',
    code: row.code,
    plan: row.plan,
    percentOff: row.percentOff,
    offerIos: row.offerIos,
    offerAndroid: row.offerAndroid,
  };
}
