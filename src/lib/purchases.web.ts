import { groupPackages, type StorePackageLike, type StorePlans } from './store-plans';

/**
 * The web build sells nothing: subscriptions go through the App Store and
 * Google Play only. Same surface as purchases.ts so screens need no checks,
 * and the SDK (with its browser billing code) stays out of the web bundle.
 */

export const purchasesLinked = false;

export type PurchasesStatus = 'unlinked' | 'off' | 'ready';
export function purchasesStatus(): PurchasesStatus {
  return 'unlinked';
}

export function configurePurchases(_keys: unknown): void {}
export function setPlanChangedHandler(_fn: () => Promise<void> | void): void {}

/**
 * Store screenshots (App Store review asks for one per subscription) are
 * taken from the web preview, which has no store. `?storePreview=1` shows the
 * paywall as a new customer sees it on a phone: the launch prices in SAR and
 * the 2-week free trial. Nothing can be bought; it only draws.
 */
function storePreview(): boolean {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('storePreview');
  } catch {
    return false;
  }
}

const TRIAL = { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 2, cycles: 1 };
const sample = (id: string, packageType: string, price: number, period: string): StorePackageLike => ({
  identifier: packageType === 'CUSTOM' ? id.replace('calgym_', '').replace('yearly', 'annual') : packageType === 'ANNUAL' ? '$rc_annual' : '$rc_monthly',
  packageType,
  product: { identifier: id, priceString: `SAR ${price.toFixed(2)}`, price, currencyCode: 'SAR', subscriptionPeriod: period, introPrice: TRIAL },
});
const PREVIEW_PACKAGES = [
  sample('calgym_essentials_monthly', 'CUSTOM', 19.99, 'P1M'),
  sample('calgym_essentials_yearly', 'CUSTOM', 149.99, 'P1Y'),
  sample('calgym_pro_monthly', 'MONTHLY', 24.99, 'P1M'),
  sample('calgym_pro_yearly', 'ANNUAL', 199.99, 'P1Y'),
];

export interface LoadedPlans {
  plans: StorePlans;
  packages: StorePackageLike[];
}
export async function loadStorePlans(): Promise<LoadedPlans | null> {
  if (!storePreview()) return null;
  return { plans: groupPackages(PREVIEW_PACKAGES), packages: PREVIEW_PACKAGES };
}

export async function trialEligibility(productIds: string[]): Promise<Record<string, boolean>> {
  return storePreview() ? Object.fromEntries(productIds.map((id) => [id, true])) : {};
}

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'pending' }
  | { kind: 'failed'; message: string };
export async function purchase(_pkg: unknown): Promise<PurchaseOutcome> {
  return { kind: 'failed', message: 'unavailable' };
}

export type RestoreOutcome = { kind: 'restored' } | { kind: 'nothing' } | { kind: 'failed'; message: string };
export async function restorePurchases(): Promise<RestoreOutcome> {
  return { kind: 'failed', message: 'unavailable' };
}

export async function takeStoreOffer(
  _offer: { offerIos: string | null; offerAndroid: string | null },
  _loaded: LoadedPlans | null,
): Promise<PurchaseOutcome | { kind: 'opened' } | { kind: 'no_offer' }> {
  return { kind: 'no_offer' };
}

export async function manageSubscription(): Promise<void> {}
