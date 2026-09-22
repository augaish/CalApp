import type { StorePlans } from './store-plans';

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

export interface LoadedPlans {
  plans: StorePlans;
  packages: never[];
}
export async function loadStorePlans(): Promise<LoadedPlans | null> {
  return null;
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
