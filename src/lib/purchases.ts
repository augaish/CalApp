import { Linking, NativeModules, Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { currentRef, onIdentityChange, reportStorefront, syncBilling } from './api';
import { findOfferOption, groupPackages, offerCodeUrl, replacementFor, type StorePlans } from './store-plans';

/**
 * In-app subscriptions, through RevenueCat's SDK.
 *
 * The SDK is a native module, and this JavaScript also ships over the air to
 * binaries built before it was added. So nothing here imports it at the top:
 * it is required on first use, and only when the native side is present —
 * an older binary simply reports `unlinked` and the upgrade screen says an
 * update is needed, rather than crashing at launch.
 *
 * Identity: the SDK is configured with the same id the app sends the server
 * as `x-calgym-user`, and follows it through sign-in and sign-out. That id is
 * what RevenueCat's webhook reports back, so a purchase lands on the right
 * account without any mapping table.
 */

type Sdk = typeof import('react-native-purchases').default;

/** Whether this binary contains the store SDK at all. */
export const purchasesLinked = NativeModules.RNPurchases != null;

let sdk: Sdk | null = null;
let configured = false;
let unsubscribeIdentity: (() => void) | null = null;

function load(): Sdk | null {
  if (!purchasesLinked) return null;
  if (!sdk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = (require('react-native-purchases') as { default: Sdk }).default;
  }
  return sdk;
}

export type PurchasesStatus = 'unlinked' | 'off' | 'ready';

export function purchasesStatus(): PurchasesStatus {
  if (!purchasesLinked) return 'unlinked';
  return configured ? 'ready' : 'off';
}

/**
 * Switch the SDK on with the public key the server hands out. Called after
 * every entitlement refresh; only the first call with a key does anything.
 * Until the server has keys, subscriptions stay off and nothing is loaded.
 */
export function configurePurchases(keys: { iosKey?: string | null; androidKey?: string | null } | null | undefined): void {
  if (configured) return;
  const apiKey = Platform.OS === 'ios' ? keys?.iosKey : Platform.OS === 'android' ? keys?.androidKey : null;
  if (!apiKey) return;
  const Purchases = load();
  if (!Purchases) return;
  try {
    Purchases.configure({ apiKey, appUserID: currentRef() });
    configured = true;
  } catch (err) {
    console.warn('purchases configure failed:', err);
    return;
  }
  unsubscribeIdentity?.();
  unsubscribeIdentity = onIdentityChange((id) => {
    Purchases.logIn(id).catch((err) => console.warn('purchases logIn failed:', err));
  });
  // Renewals, refunds and offer-code redemptions made in the App Store all
  // arrive here. Ask the server to catch up, then re-read the plan.
  Purchases.addCustomerInfoUpdateListener(() => {
    void afterStoreChange();
  });
}

let onPlanChanged: (() => Promise<void> | void) | null = null;
/** The entitlement store registers its refresh here (avoids an import cycle). */
export function setPlanChangedHandler(fn: () => Promise<void> | void): void {
  onPlanChanged = fn;
}

let catchingUp: Promise<void> | null = null;
async function afterStoreChange(): Promise<void> {
  if (catchingUp) return catchingUp;
  catchingUp = (async () => {
    await syncBilling();
    await onPlanChanged?.();
  })().finally(() => {
    catchingUp = null;
  });
  return catchingUp;
}

export interface LoadedPlans {
  plans: StorePlans<PurchasesPackage>;
  packages: PurchasesPackage[];
}

/** The current offering, sorted into tiers. Null when the store has nothing to sell. */
let storeReported = false;
/** Once a launch: the store country and the currency the prices came in, for the admin list. */
async function reportStoreOnce(currency: string | null): Promise<void> {
  if (storeReported) return;
  storeReported = true;
  const Purchases = load();
  let country: string | null = null;
  try {
    country = (await Purchases?.getStorefront?.())?.countryCode ?? null;
  } catch {
    // Older SDK or no store account: the currency still says enough.
  }
  await reportStorefront(country, currency);
}

export async function loadStorePlans(): Promise<LoadedPlans | null> {
  const Purchases = configured ? load() : null;
  if (!Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    if (packages.length === 0) return null;
    void reportStoreOnce(packages[0].product.currencyCode);
    return { plans: groupPackages(packages), packages };
  } catch (err) {
    console.warn('offerings failed:', err);
    return null;
  }
}

/**
 * Which products this person may still take a free trial on. Apple allows one
 * introductory offer per subscription group, so iOS asks the store; Google
 * Play only hands the app offers the person is eligible for, so a trial that
 * reached us there is theirs to take. Unknown counts as not eligible: the
 * paywall must never promise a trial the store then won't give.
 */
export async function trialEligibility(productIds: string[]): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  if (productIds.length === 0) return out;
  if (Platform.OS === 'android') {
    for (const id of productIds) out[id] = true;
    return out;
  }
  const Purchases = configured ? load() : null;
  if (!Purchases || Platform.OS !== 'ios') return out;
  try {
    const found = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    for (const id of productIds) {
      out[id] = found[id]?.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
    }
  } catch (err) {
    console.warn('trial eligibility failed:', err);
  }
  return out;
}

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'pending' }
  | { kind: 'failed'; message: string };

function outcomeFromError(err: unknown): PurchaseOutcome {
  const e = err as { userCancelled?: boolean | null; code?: string; message?: string };
  if (e?.userCancelled || e?.code === '1') return { kind: 'cancelled' };
  // Ask to Buy, or a cash payment the store is waiting on.
  if (e?.code === '20') return { kind: 'pending' };
  return { kind: 'failed', message: e?.message ?? String(err) };
}

/** A purchase went through: bring the server and the plan up to date before saying so. */
async function settled(): Promise<PurchaseOutcome> {
  await afterStoreChange();
  return { kind: 'purchased' };
}

export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  const Purchases = load();
  if (!Purchases || !configured) return { kind: 'failed', message: 'unavailable' };
  try {
    // Play treats a second tier as a second subscription unless told it
    // replaces the first; the App Store does that itself within a group, and
    // the replacement mode matches Apple's: an upgrade now, paying only the
    // difference; a downgrade when the current period (or trial) ends.
    let change: Parameters<Sdk['purchasePackage']>[2] = null;
    if (Platform.OS === 'android') {
      const info = await Purchases.getCustomerInfo().catch(() => null);
      const want = pkg.product.identifier.split(':')[0];
      const old = info?.activeSubscriptions.map((id) => id.split(':')[0]).find((id) => id !== want);
      if (old) change = { oldProductIdentifier: old, replacementMode: Purchases.STORE_REPLACEMENT_MODE?.[replacementFor(old, want)] };
    }
    await Purchases.purchasePackage(pkg, null, change);
    return settled();
  } catch (err) {
    return outcomeFromError(err);
  }
}

export type RestoreOutcome = { kind: 'restored' } | { kind: 'nothing' } | { kind: 'failed'; message: string };

export async function restorePurchases(): Promise<RestoreOutcome> {
  const Purchases = load();
  if (!Purchases || !configured) return { kind: 'failed', message: 'unavailable' };
  try {
    const info = await Purchases.restorePurchases();
    await afterStoreChange();
    return Object.keys(info.entitlements.active).length > 0 ? { kind: 'restored' } : { kind: 'nothing' };
  } catch (err) {
    const o = outcomeFromError(err);
    return o.kind === 'failed' ? o : { kind: 'nothing' };
  }
}

/**
 * Take a percent code's discount to the store.
 *
 * iOS: Apple only discounts through its own offer-code sheet, so we open it
 * with the code filled in; the listener above hears the result.
 * Android: the discount is a Play offer on the subscription, bought directly.
 */
export async function takeStoreOffer(
  offer: { offerIos: string | null; offerAndroid: string | null },
  loaded: LoadedPlans | null,
): Promise<PurchaseOutcome | { kind: 'opened' } | { kind: 'no_offer' }> {
  if (Platform.OS === 'ios') {
    if (!offer.offerIos) return { kind: 'no_offer' };
    try {
      await Linking.openURL(offerCodeUrl(offer.offerIos));
      return { kind: 'opened' };
    } catch {
      // Fall back to Apple's blank sheet; the person types the code there.
      const Purchases = load();
      if (!Purchases || !configured) return { kind: 'no_offer' };
      await Purchases.presentCodeRedemptionSheet().catch(() => {});
      return { kind: 'opened' };
    }
  }
  if (Platform.OS === 'android') {
    const Purchases = load();
    if (!offer.offerAndroid || !Purchases || !configured || !loaded) return { kind: 'no_offer' };
    const found = findOfferOption(loaded.packages, offer.offerAndroid);
    const option = found?.pkg.product.subscriptionOptions?.find((o) => o.id === found.optionId);
    if (!option) return { kind: 'no_offer' };
    try {
      await Purchases.purchaseSubscriptionOption(option);
      return settled();
    } catch (err) {
      return outcomeFromError(err);
    }
  }
  return { kind: 'no_offer' };
}

/** The store's own page for changing or cancelling a subscription. */
export async function manageSubscription(): Promise<void> {
  const Purchases = configured ? load() : null;
  if (Purchases) {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      // fall through to the store's web page
    }
  }
  await Linking.openURL(
    Platform.OS === 'android'
      ? 'https://play.google.com/store/account/subscriptions'
      : 'https://apps.apple.com/account/subscriptions',
  ).catch(() => {});
}
