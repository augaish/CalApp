/**
 * Reading the store's products into the app's tiers.
 *
 * Kept free of React Native so it can be tested on its own: everything here
 * takes plain objects shaped like the purchases SDK's packages.
 *
 * The rule that matters: every price the person sees on the upgrade screen
 * comes from the store product (`priceString`), never from our own settings.
 * Apple and Google set the local price, currency and tax for each country,
 * and that string is what they will charge — so there is one place a price
 * lives, and it is the store.
 */

export type PaidTier = 'pro' | 'proPlus';
export type BillingPeriod = 'monthly' | 'annual';

/** The parts of an SDK package this module reads. */
export interface StorePackageLike {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    priceString: string;
    price: number;
    currencyCode: string;
    subscriptionPeriod?: string | null;
    subscriptionOptions?: { id: string; storeProductId?: string; isBasePlan?: boolean }[] | null;
  };
}

export type StorePlans<P extends StorePackageLike = StorePackageLike> = Record<
  PaidTier,
  Partial<Record<BillingPeriod, P>>
>;

/** Which tier a package sells. Pro+ first: "pro" is inside every Pro+ id. */
export function tierOf(pkg: StorePackageLike): PaidTier {
  const ids = `${pkg.product.identifier} ${pkg.identifier}`.toLowerCase();
  return /plus|pro_?\+/.test(ids) ? 'proPlus' : 'pro';
}

/** How often a package bills, or null for anything that is not a plain subscription. */
export function periodOf(pkg: StorePackageLike): BillingPeriod | null {
  const type = pkg.packageType.toUpperCase();
  if (type === 'ANNUAL') return 'annual';
  if (type === 'MONTHLY') return 'monthly';
  const p = pkg.product.subscriptionPeriod ?? '';
  if (p === 'P1Y' || p === 'P12M') return 'annual';
  if (p === 'P1M' || p === 'P4W') return 'monthly';
  // A custom package still says what it is in its name.
  const ids = `${pkg.product.identifier} ${pkg.identifier}`.toLowerCase();
  if (/annual|year|yearly/.test(ids)) return 'annual';
  if (/month/.test(ids)) return 'monthly';
  return null;
}

/** Sort an offering's packages into tier × period. First match wins. */
export function groupPackages<P extends StorePackageLike>(packages: P[]): StorePlans<P> {
  const out: StorePlans<P> = { pro: {}, proPlus: {} };
  for (const pkg of packages) {
    const period = periodOf(pkg);
    if (!period) continue;
    const tier = tierOf(pkg);
    if (!out[tier][period]) out[tier][period] = pkg;
  }
  return out;
}

export function hasAnyPlan(plans: StorePlans | null | undefined): boolean {
  return !!plans && Object.values(plans).some((t) => t.monthly || t.annual);
}

/**
 * What the annual price saves against twelve monthly ones, as a whole
 * percentage — only when it really is cheaper, and only between prices in
 * the same currency.
 */
export function annualSaving(plans: StorePlans, tier: PaidTier): number | null {
  const m = plans[tier].monthly?.product;
  const y = plans[tier].annual?.product;
  if (!m || !y || m.currencyCode !== y.currencyCode || m.price <= 0) return null;
  const pct = Math.round((1 - y.price / (m.price * 12)) * 100);
  return pct > 0 ? pct : null;
}

/**
 * The Play subscription option a percent code points at. The admin may type
 * the full option id ("monthly:ramadan50") or just the offer's own id
 * ("ramadan50"); either finds it. Returns the package too, because the
 * purchase needs both.
 */
export function findOfferOption<P extends StorePackageLike>(
  packages: P[],
  offerId: string,
): { pkg: P; optionId: string } | null {
  const want = offerId.trim().toLowerCase();
  if (!want) return null;
  for (const pkg of packages) {
    for (const opt of pkg.product.subscriptionOptions ?? []) {
      const id = opt.id.toLowerCase();
      if (id === want || id.endsWith(`:${want}`)) return { pkg, optionId: opt.id };
    }
  }
  return null;
}

/** Calgym's App Store id (App Store Connect → App Information). */
export const APP_STORE_ID = '6793969631';

/**
 * Apple's own page for redeeming an offer code, with the code filled in.
 * Opening it hands the person to the App Store, which shows the discounted
 * price in their currency, applies their tax, and takes the payment.
 */
export function offerCodeUrl(code: string): string {
  return `https://apps.apple.com/redeem?ctx=offercodes&id=${APP_STORE_ID}&code=${encodeURIComponent(code.trim())}`;
}
