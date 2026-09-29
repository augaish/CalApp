import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';

import { alertProblem } from '@/lib/alerts';
import i18n from '@/lib/i18n';
import { setModule } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { choiceForReason, type Choice } from '@/lib/plan-gates';
import {
  configurePurchases,
  loadStorePlans,
  purchase,
  purchasesStatus,
  restorePurchases,
  trialEligibility,
  type LoadedPlans,
} from '@/lib/purchases';
import { useAppStore } from '@/lib/store';
import { freeTrialDays, type BillingPeriod, type PaidTier } from '@/lib/store-plans';

export { reasonText } from '@/lib/plan-gates';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'long' });
}

/**
 * Everything a screen needs to sell a plan from the store: the store's plans
 * and prices, the chosen tier and period, and buy / restore with their
 * outcomes told to the person. The membership sheet and the full Upgrade page
 * share it, so the two can never disagree about a price or a purchase.
 */
export function useStoreOffer(reason?: string) {
  const { t } = useTranslation();
  const router = useRouter();
  const plan = useEntitlement((s) => s.plan);
  const locks = useEntitlement((s) => s.locks);
  const module = useEntitlement((s) => s.module);
  const billing = useEntitlement((s) => s.billing);
  const planUntil = useEntitlement((s) => s.planUntil);
  // Food / Training / Both: one area is Essentials for it, both is Pro. It
  // starts from what the person told onboarding, or from what opened the sheet.
  const [choice, setChoice] = useState<Choice>(() =>
    choiceForReason(reason, { plan, locks, module }, useAppStore.getState().focusAreas),
  );

  const [store, setStore] = useState<LoadedPlans | null>(null);
  const [storeChecked, setStoreChecked] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const tier: PaidTier = choice === 'both' ? 'pro' : 'essentials';
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [eligible, setEligible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      // The screen can open before launch's refresh has switched the SDK on.
      configurePurchases(billing);
      const loaded = await loadStorePlans();
      if (!live) return;
      setStore(loaded);
      setStoreChecked(true);
      // Only products that offer a free trial need asking about.
      const withTrial = (loaded?.packages ?? []).filter((p) => freeTrialDays(p) != null).map((p) => p.product.identifier);
      const found = await trialEligibility(withTrial);
      if (live) setEligible(found);
    })();
    return () => {
      live = false;
    };
  }, [billing]);

  const status = purchasesStatus();
  // Subscriptions are switched on at the server, but this binary predates the
  // store SDK: say so, rather than show a button that cannot work.
  const serverSells = Platform.OS === 'ios' ? !!billing?.iosKey : Platform.OS === 'android' ? !!billing?.androidKey : false;
  const needsUpdate = serverSells && status === 'unlinked';
  const plans = store?.plans ?? null;
  const hasAnnual = !!plans && !!(plans.pro.annual || plans.proPlus.annual);
  const shownPeriod: BillingPeriod = hasAnnual ? period : 'monthly';
  const selectedPkg = plans ? (plans[tier][shownPeriod] ?? plans[tier].monthly ?? null) : null;
  const storeName = Platform.OS === 'android' ? t('upgrade.storeGoogle') : t('upgrade.storeApple');

  const priceFor = (id: PaidTier): { main: string; unit: string } | null => {
    if (!plans) return null;
    const pkg = plans[id][shownPeriod] ?? plans[id].monthly;
    if (!pkg) return null;
    const annual = pkg === plans[id].annual;
    return { main: pkg.product.priceString, unit: annual ? t('upgrade.perYearStore') : t('upgrade.perMonthStore') };
  };

  /** Days of free trial the selected period's package gives this person, or null. */
  const trialDaysFor = (id: PaidTier): number | null => {
    if (!plans) return null;
    const pkg = plans[id][shownPeriod] ?? plans[id].monthly;
    if (!pkg || !eligible[pkg.product.identifier]) return null;
    return freeTrialDays(pkg);
  };

  /** Buys the selected plan; `onDone` runs after the person dismisses the thank-you. */
  const buy = async (onDone: () => void) => {
    if (!selectedPkg) return;
    setBusy('buy');
    // Essentials needs its module before the plan arrives, so the app opens
    // on the right one. A failure here doesn't stop the purchase: the member
    // is asked to choose afterwards.
    if (choice !== 'both') await setModule(choice);
    // From Pro to Essentials is a downgrade: both stores apply it when the
    // current period (or free trial) ends, and keep everything until then.
    const downgrade = choice !== 'both' && (plan === 'pro' || plan === 'proPlus');
    const tierBought: PaidTier = choice === 'both' ? 'pro' : 'essentials';
    const trialDays = trialDaysFor(tierBought) ?? 0;
    const out = await purchase(selectedPkg);
    setBusy(null);
    if (out.kind === 'purchased' && downgrade) {
      useAppStore.getState().setPlanSwitch({ module: choice, at: planUntil ?? null });
      const name = t(`plans.name.essentials_${choice}`);
      Alert.alert(
        t('plans.switchDoneTitle'),
        planUntil ? t('plans.switchDone', { plan: name, date: shortDate(planUntil) }) : t('plans.switchDoneNoDate', { plan: name }),
        [{ text: t('common.done'), onPress: onDone }],
      );
    } else if (out.kind === 'purchased') {
      // The welcome moment, in place of a plain "Thank you" alert.
      onDone();
      setTimeout(
        () => router.push({ pathname: '/plan-welcome', params: { tier: tierBought, focus: choice, trial: String(trialDays) } }),
        350,
      );
    } else if (out.kind === 'pending') {
      Alert.alert(t('upgrade.pendingTitle'), t('upgrade.purchasePending'));
    } else if (out.kind === 'failed') {
      alertProblem(t('upgrade.failedTitle'), t('upgrade.purchaseFailed'));
    }
  };

  const restore = async () => {
    setBusy('restore');
    const out = await restorePurchases();
    setBusy(null);
    if (out.kind === 'restored') Alert.alert(t('upgrade.restoredTitle'), t('upgrade.restored'));
    else if (out.kind === 'nothing') Alert.alert(t('upgrade.restore'), t('upgrade.restoreNone', { store: storeName }));
    else alertProblem(t('upgrade.failedTitle'), t('upgrade.restoreFailed'));
  };

  return {
    plans,
    storeChecked,
    status,
    serverSells,
    needsUpdate,
    hasAnnual,
    period: shownPeriod,
    setPeriod,
    tier,
    choice,
    setChoice,
    selectedPkg,
    priceFor,
    trialDaysFor,
    storeName,
    busy,
    buy,
    restore,
  };
}
