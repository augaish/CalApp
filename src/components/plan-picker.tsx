import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Segmented } from '@/components/system';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEntitlement } from '@/lib/entitlement';
import type { Choice } from '@/lib/plan-gates';
import { annualSaving } from '@/lib/store-plans';
import type { useStoreOffer } from '@/lib/use-store-offer';

type Offer = ReturnType<typeof useStoreOffer>;

/** Used until the server answers, and while the store has nothing to sell. */
const FALLBACK = { essentials: 19.99, essentialsYearly: 149.99, pro: 24.99, proYearly: 199.99, currency: 'SAR', ess: 20, pro_ai: 50 };

const CHOICES: { key: Choice; icon: 'restaurant' | 'barbell' | 'sparkles' }[] = [
  { key: 'food', icon: 'restaurant' },
  { key: 'training', icon: 'barbell' },
  { key: 'both', icon: 'sparkles' },
];

const INCLUDES = ['a', 'b', 'c', 'd'] as const;

/** Display prices from the server, for when the store isn't selling yet. */
function useFallbackPrices() {
  const pricing = useEntitlement((s) => s.pricing);
  return {
    essentials: pricing?.essentials ?? FALLBACK.essentials,
    essentialsYearly: pricing?.essentialsYearly ?? FALLBACK.essentialsYearly,
    pro: pricing?.pro ?? FALLBACK.pro,
    proYearly: pricing?.proYearly ?? FALLBACK.proYearly,
    currency: pricing?.currency ?? FALLBACK.currency,
    essAi: pricing?.limits?.essentials ?? FALLBACK.ess,
    proAi: pricing?.limits?.pro ?? FALLBACK.pro_ai,
  };
}

/**
 * "What do you want help with?" — Food, Training or Both — and the one plan
 * that answers it: Essentials for one area, Pro (recommended) for both. Shows
 * the store's own price, what's included, the free trial when this person can
 * still take it, and a one-line nudge from Essentials to Pro with the real
 * difference in price.
 */
export function PlanPicker({ offer }: { offer: Offer }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const fb = useFallbackPrices();
  const { plans, choice, setChoice, tier, priceFor, trialDaysFor, hasAnnual, period, setPeriod } = offer;

  const storePrice = priceFor(tier);
  const trial = trialDaysFor(tier);
  const monthly = tier === 'pro' ? fb.pro : fb.essentials;
  const yearly = tier === 'pro' ? fb.proYearly : fb.essentialsYearly;
  const ai = tier === 'pro' ? fb.proAi : fb.essAi;

  // The difference to Pro, from the store's monthly prices when it sells.
  const essM = plans?.essentials.monthly?.product;
  const proM = plans?.pro.monthly?.product;
  const diff = essM && proM && essM.currencyCode === proM.currencyCode
    ? `${(proM.price - essM.price).toFixed(2)} ${proM.currencyCode}`
    : `${(fb.pro - fb.essentials).toFixed(2)} ${fb.currency}`;

  return (
    <View>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: Spacing.sm }}>{t('plans.helpWith')}</Text>
      <View style={styles.choices} accessibilityRole="radiogroup">
        {CHOICES.map((c) => {
          const selected = choice === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setChoice(c.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.choice, { backgroundColor: selected ? theme.surfaceTint : theme.card, borderColor: selected ? theme.primary : theme.border, borderWidth: selected ? 2 : 1 }]}
            >
              <Icon name={c.icon} size={22} color={theme.primary} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, marginTop: 4 }}>{t(`plans.choice.${c.key}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.plan, { backgroundColor: theme.card, borderColor: theme.primary }]}>
        <View style={styles.planHead}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, flex: 1 }}>
            {choice === 'both' ? t('plans.name.pro') : t(`plans.name.essentials_${choice}`)}
          </Text>
          {choice === 'both' ? (
            <View style={[styles.tag, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.onPrimary, fontSize: 11, fontWeight: '800' }}>{t('plans.recommended')}</Text>
            </View>
          ) : null}
        </View>

        {plans && hasAnnual ? (
          <Segmented
            options={[
              { key: 'monthly', label: t('upgrade.monthly') },
              {
                key: 'annual',
                label: (() => {
                  const save = annualSaving(plans, tier);
                  return save ? t('upgrade.yearlySave', { percent: save }) : t('upgrade.yearlyTab');
                })(),
              },
            ]}
            value={period}
            onChange={setPeriod}
            style={{ marginVertical: Spacing.sm }}
          />
        ) : null}

        <Text style={{ color: theme.text, marginTop: 4 }}>
          {storePrice ? (
            <>
              <Text style={{ fontSize: 22, fontWeight: '800' }}>{storePrice.main}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}> {storePrice.unit}</Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 22, fontWeight: '800' }}>{monthly}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}> {t('upgrade.perMonthShort', { currency: fb.currency })}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{`  ·  ${t('upgrade.yearlyPlain', { price: yearly, currency: fb.currency })}`}</Text>
            </>
          )}
        </Text>
        {trial ? <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13, marginTop: 4 }}>{t('upgrade.trialBadge', { days: trial })}</Text> : null}

        <View style={{ gap: 6, marginTop: Spacing.sm }}>
          {INCLUDES.map((k) => (
            <View key={k} style={styles.line}>
              <Icon name="checkmark-circle" size={16} color={theme.successText} />
              <Text style={{ color: theme.text, fontSize: 14, flex: 1, lineHeight: 19 }}>{t(`plans.includes.${choice}.${k}`)}</Text>
            </View>
          ))}
          <View style={styles.line}>
            <Icon name="checkmark-circle" size={16} color={theme.successText} />
            <Text style={{ color: theme.text, fontSize: 14, flex: 1, lineHeight: 19 }}>{t('plans.aiPerMonth', { count: ai })}</Text>
          </View>
        </View>

        {choice !== 'both' ? (
          <Pressable onPress={() => setChoice('both')} accessibilityRole="button" style={[styles.upsell, { backgroundColor: theme.surfaceTint }]}>
            <Icon name="sparkles" size={16} color={theme.primaryDark} />
            <Text style={{ color: theme.primaryDark, fontSize: 13, fontWeight: '700', flex: 1 }}>{t(`plans.upsell.${choice}`, { diff })}</Text>
            <Icon name="chevron-forward" size={14} color={theme.primaryDark} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The picker's main button and the trial terms that must sit right above it:
 * start the trial or subscribe; say so when this is already the plan; send an
 * Essentials member picking the other area to the focus screen, since that is
 * a switch, not a purchase.
 */
export function usePlanAction(offer: Offer, onDone: () => void) {
  const { t } = useTranslation();
  const router = useRouter();
  const plan = useEntitlement((s) => s.plan);
  const module = useEntitlement((s) => s.module);
  const promo = useEntitlement((s) => s.promo);
  const { plans, selectedPkg, choice, tier, priceFor, trialDaysFor, storeName, busy, needsUpdate, storeChecked, serverSells } = offer;

  const current = !promo && ((tier === 'pro' && (plan === 'pro' || plan === 'proPlus')) || (tier === 'essentials' && plan === 'essentials' && module === choice));
  const switchFocus = !current && tier === 'essentials' && plan === 'essentials';
  const price = selectedPkg ? priceFor(tier) : null;
  const trial = selectedPkg && !current && !switchFocus ? trialDaysFor(tier) : null;

  if (switchFocus) return { label: t('plans.changeFocus'), disabled: false, loading: false, onPress: () => router.push('/focus'), terms: null };
  if (plans && selectedPkg) {
    return {
      label: current ? t('upgrade.currentPlan') : trial ? t('upgrade.startTrial', { days: trial }) : t('upgrade.subscribe', { price: price ? `${price.main} ${price.unit}` : '' }),
      disabled: current || busy !== null,
      loading: busy === 'buy',
      onPress: () => void offer.buy(onDone),
      // Apple requires the trial's length, what follows and how to cancel
      // right where the trial is started.
      terms: trial && price ? t('upgrade.trialTerms', { days: trial, price: price.main, unit: price.unit, store: storeName }) : null,
    };
  }
  if (needsUpdate) return { label: t('upgrade.updateNeeded'), disabled: true, loading: false, onPress: () => {}, terms: null };
  return { label: storeChecked || !serverSells ? t('upgrade.soon') : t('common.loading'), disabled: true, loading: false, onPress: () => {}, terms: null };
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', gap: Spacing.sm },
  choice: { flex: 1, alignItems: 'center', borderRadius: Radius.md, paddingVertical: Spacing.ms },
  plan: { borderRadius: Radius.md, borderWidth: 2, padding: Spacing.md, marginTop: Spacing.ms },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tag: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  upsell: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: Radius.control, marginTop: Spacing.ms },
});
