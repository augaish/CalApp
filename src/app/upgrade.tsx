import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Segmented } from '@/components/system';
import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SERVER_URL } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { manageSubscription } from '@/lib/purchases';
import { annualSaving } from '@/lib/store-plans';
import { MEMBERSHIP_FEATURES, useStoreOffer } from '@/lib/use-store-offer';

/** Used until `/api/me` answers (and on a server that predates `pricing`) —
 * the same numbers this screen shipped with, so nothing ever renders blank.
 * Shown only while the store has nothing to sell: once it does, every price
 * on this screen is the store's own. */
const FALLBACK = {
  pro: 13,
  proPlus: 25,
  proYearly: 129,
  currency: 'SAR',
  limits: { free: 15, pro: 150, proPlus: 500 },
  coachCap: 5,
};

export default function Upgrade() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  const plan = useEntitlement((s) => s.plan);
  const used = useEntitlement((s) => s.used);
  const limit = useEntitlement((s) => s.limit);
  const pricing = useEntitlement((s) => s.pricing);
  const promo = useEntitlement((s) => s.promo);
  const pro = plan === 'pro' || plan === 'proPlus';

  const offer = useStoreOffer();
  const { plans, storeChecked, status, serverSells, needsUpdate, hasAnnual, tier, setTier, selectedPkg, priceFor, storeName, busy } = offer;
  const shownPeriod = offer.period;
  const setPeriod = offer.setPeriod;

  // Only while the store has nothing to sell.
  const currency = pricing?.currency ?? FALLBACK.currency;
  const limits = { ...FALLBACK.limits, ...(pricing?.limits ?? {}) };
  const coachCap = pricing?.coachCap ?? FALLBACK.coachCap;
  const yearly = pricing?.proYearly ?? FALLBACK.proYearly;
  const monthly = pricing?.pro ?? FALLBACK.pro;
  const savePct = monthly > 0 ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const tiers = [
    {
      id: 'free' as const,
      name: t('upgrade.tierFree'),
      desc: t('upgrade.tierFreeDesc', { count: limits.free, coach: coachCap }),
      fallback: 0,
    },
    {
      id: 'pro' as const,
      name: t('upgrade.tierPro'),
      desc: t('upgrade.tierProDesc', { count: limits.pro }),
      fallback: monthly,
    },
    {
      id: 'proPlus' as const,
      name: t('upgrade.tierProPlus'),
      desc: t('upgrade.tierProPlusDesc', { count: limits.proPlus }),
      fallback: pricing?.proPlus ?? FALLBACK.proPlus,
    },
  ].filter((x) => x.id === 'free' || !plans || plans[x.id].monthly || plans[x.id].annual);

  const buy = () => offer.buy(() => router.back());
  const restore = offer.restore;

  const currentTierSelected = plan === tier && !promo;

  const primary = (() => {
    if (plans && selectedPkg) {
      const p = priceFor(tier);
      return (
        <Button
          label={currentTierSelected ? t('upgrade.currentPlan') : t('upgrade.subscribe', { price: p ? `${p.main} ${p.unit}` : '' })}
          disabled={currentTierSelected || busy !== null}
          loading={busy === 'buy'}
          onPress={buy}
        />
      );
    }
    if (needsUpdate) return <Button label={t('upgrade.updateNeeded')} disabled onPress={() => {}} />;
    return <Button label={storeChecked || !serverSells ? t('upgrade.soon') : t('common.loading')} disabled onPress={() => {}} />;
  })();

  return (
    <Screen
      footer={
        <View>
          {primary}
          {plans ? (
            <Button
              label={t('upgrade.restore')}
              variant="ghost"
              loading={busy === 'restore'}
              disabled={busy !== null}
              onPress={restore}
              style={{ marginTop: Spacing.xs }}
            />
          ) : (
            <Button
              label={t('common.close')}
              variant="ghost"
              onPress={() => router.back()}
              style={{ marginTop: Spacing.xs }}
            />
          )}
        </View>
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Icon name="sparkles" size={30} color="#fff" />
        <Text style={styles.heroTitle}>{t('upgrade.title')}</Text>
        <Text style={styles.heroSub}>{t('upgrade.subtitle')}</Text>
      </LinearGradient>

      {reason ? (
        <Card style={{ borderColor: theme.warning, borderWidth: 1 }}>
          <Text style={{ color: theme.warningText, fontWeight: '600' }}>
            {reason === 'coach'
              ? t('upgrade.coachLocked')
              : reason === 'equipment'
                ? t('upgrade.equipmentLocked')
                : t('upgrade.quotaHit', { used: used ?? 0, limit: limit ?? 0 })}
          </Text>
        </Card>
      ) : null}

      {pro && (
        <Card style={{ borderColor: theme.primary, borderWidth: 1 }}>
          <View style={styles.proRow}>
            <Icon name="checkmark-circle" size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('upgrade.alreadyPro')}</Text>
              {promo ? (
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {t('upgrade.promoActive', {
                    plan: promo.plan === 'proPlus' ? t('upgrade.planProPlus') : t('upgrade.planPro'),
                    date: date(promo.until),
                  })}
                </Text>
              ) : null}
            </View>
          </View>
          {!promo && status === 'ready' ? (
            <Pressable onPress={() => void manageSubscription()} style={{ marginTop: Spacing.sm }} accessibilityRole="link">
              <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('upgrade.manage')}</Text>
            </Pressable>
          ) : null}
        </Card>
      )}

      <Card>
        {MEMBERSHIP_FEATURES.map((f, i) => (
          <View
            key={f.key}
            style={[
              styles.featureRow,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
            ]}
          >
            <View style={[styles.featureIcon, { backgroundColor: theme.cardSubtle }]}>
              <Icon name={f.icon} size={17} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                {t(`upgrade.features.${f.key}.title`)}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {t(`upgrade.features.${f.key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
        {t('upgrade.pricing')}
      </Text>
      {hasAnnual && plans ? (
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
          value={shownPeriod}
          onChange={setPeriod}
          style={{ marginBottom: Spacing.sm }}
        />
      ) : null}
      {tiers.map((row) => {
        const current = plan === row.id;
        const selectable = !!plans && row.id !== 'free';
        const selected = selectable && tier === row.id;
        const storePrice = row.id === 'free' ? null : priceFor(row.id);
        return (
          <Pressable
            key={row.id}
            disabled={!selectable}
            onPress={() => row.id !== 'free' && setTier(row.id)}
            accessibilityRole={selectable ? 'radio' : undefined}
            accessibilityState={selectable ? { selected } : undefined}
          >
            <Card
              style={
                selected || (!plans && row.id === 'pro')
                  ? { borderColor: theme.primary, borderWidth: 2 }
                  : undefined
              }
            >
              <View style={styles.tierHead}>
                {selectable ? (
                  <Icon
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selected ? theme.primary : theme.textTertiary}
                    style={{ alignSelf: 'center' }}
                  />
                ) : null}
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', flex: 1 }}>
                  {row.name}
                </Text>
                {current && (
                  <View style={[styles.currentBadge, { backgroundColor: theme.cardSubtle }]}>
                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '800' }}>
                      {t('upgrade.current')}
                    </Text>
                  </View>
                )}
                {storePrice ? (
                  <>
                    <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{storePrice.main}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{storePrice.unit}</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{row.fallback}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {row.fallback === 0 ? '' : t('upgrade.perMonthShort', { currency })}
                    </Text>
                  </>
                )}
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>{row.desc}</Text>
              {!plans && row.id === 'pro' && yearly > 0 && (
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                  {savePct > 0
                    ? t('upgrade.yearly', { price: yearly, currency, percent: savePct })
                    : t('upgrade.yearlyPlain', { price: yearly, currency })}
                </Text>
              )}
            </Card>
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => router.push('/redeem')}
        style={[styles.codeRow, { borderColor: theme.border }]}
        accessibilityRole="button"
      >
        <Icon name="pricetag-outline" size={18} color={theme.primary} />
        <Text style={{ color: theme.primary, fontWeight: '700', flex: 1 }}>{t('upgrade.haveCode')}</Text>
        <Icon name={i18n.dir?.() === 'rtl' ? 'chevron-back' : 'chevron-forward'} size={16} color={theme.textTertiary} />
      </Pressable>

      <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>
        {t('upgrade.freeNote')}
      </Text>
      {plans ? (
        <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm, lineHeight: 17 }}>
          {t('upgrade.legal', { store: storeName })}{' '}
          <Text style={{ color: theme.primary }} onPress={() => Linking.openURL(`${SERVER_URL}/terms`)}>
            {t('legal.terms')}
          </Text>
          {' · '}
          <Text style={{ color: theme.primary }} onPress={() => Linking.openURL(`${SERVER_URL}/privacy`)}>
            {t('legal.privacy')}
          </Text>
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  hero: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  currentBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    marginTop: Spacing.xs,
  },
});
