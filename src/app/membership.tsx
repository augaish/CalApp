import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Segmented } from '@/components/system';
import { Button } from '@/components/ui';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SERVER_URL } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { annualSaving, type PaidTier } from '@/lib/store-plans';
import { MEMBERSHIP_FEATURES, useStoreOffer } from '@/lib/use-store-offer';

/**
 * The membership sheet: what membership adds, the store's price and a way to
 * subscribe without leaving the sheet — and always a way out (X, "Not now",
 * or a tap outside). It offers itself gently (see membership-prompt.ts) and
 * opens when a free limit is reached; "Compare plans" leads to the full page.
 */
export default function Membership() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const used = useEntitlement((s) => s.used);
  const limit = useEntitlement((s) => s.limit);
  const offer = useStoreOffer();
  const { plans, storeChecked, serverSells, needsUpdate, hasAnnual, period, setPeriod, tier, setTier, selectedPkg, priceFor, storeName, busy } = offer;

  // Opened by a link with nothing behind it, closing lands on Overview.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const tiers = (['pro', 'proPlus'] as PaidTier[]).filter((id) => !plans || plans[id].monthly || plans[id].annual);
  const price = selectedPkg ? priceFor(tier) : null;
  const forward = i18n.dir?.() === 'rtl' ? 'chevron-back' : 'chevron-forward';

  const primary = plans && selectedPkg ? (
    <Button
      label={t('upgrade.subscribe', { price: price ? `${price.main} ${price.unit}` : '' })}
      loading={busy === 'buy'}
      disabled={busy !== null}
      onPress={() => offer.buy(close)}
    />
  ) : needsUpdate ? (
    <Button label={t('upgrade.updateNeeded')} disabled onPress={() => {}} />
  ) : (
    <Button label={storeChecked || !serverSells ? t('upgrade.soon') : t('common.loading')} disabled onPress={() => {}} />
  );

  return (
    <View style={styles.backdrop}>
      {/* Tap outside to close — a layer behind the sheet, not a wrapper round it. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <View
        onStartShouldSetResponder={() => true}
        style={[styles.sheet, { backgroundColor: theme.background, maxHeight: '94%' }, cardShadow(theme.shadow)]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <Pressable
          onPress={close}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
        >
          <Icon name="close" size={26} color={theme.textSecondary} />
        </Pressable>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.sm }}>
          <View style={styles.hero}>
            <LinearGradient colors={[theme.gradientStart, theme.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
              <Icon name="sparkles" size={28} color="#fff" />
            </LinearGradient>
            <Text style={[Type.title, styles.center, { color: theme.text }]} accessibilityRole="header">
              {t('membership.title')}
            </Text>
            <Text style={[styles.center, { color: theme.textSecondary, fontSize: 15, lineHeight: 21 }]}>{t('membership.subtitle')}</Text>
          </View>

          {reason ? (
            <View style={[styles.reason, { backgroundColor: theme.cardSubtle, borderColor: theme.warning }]}>
              <Text style={{ color: theme.warningText, fontWeight: '600' }}>
                {reason === 'coach'
                  ? t('upgrade.coachLocked')
                  : reason === 'equipment'
                    ? t('upgrade.equipmentLocked')
                    : t('upgrade.quotaHit', { used: used ?? 0, limit: limit ?? 0 })}
              </Text>
            </View>
          ) : null}

          <View style={{ gap: Spacing.ms, marginBottom: Spacing.md }}>
            {MEMBERSHIP_FEATURES.map((f) => (
              <View key={f.key} style={styles.feature}>
                <View style={[styles.featureIcon, { backgroundColor: theme.cardSubtle }]}>
                  <Icon name={f.icon} size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{t(`upgrade.features.${f.key}.title`)}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>{t(`upgrade.features.${f.key}.body`)}</Text>
                </View>
              </View>
            ))}
          </View>

          {plans ? (
            <>
              {hasAnnual ? (
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
                  style={{ marginBottom: Spacing.sm }}
                />
              ) : null}
              <View style={styles.tiers} accessibilityRole="radiogroup">
                {tiers.map((id) => {
                  const selected = tier === id;
                  const p = priceFor(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setTier(id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={[
                        styles.tier,
                        { backgroundColor: theme.card, borderColor: selected ? theme.primary : theme.border, borderWidth: selected ? 2 : 1 },
                      ]}
                    >
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{id === 'proPlus' ? t('upgrade.tierProPlus') : t('upgrade.tierPro')}</Text>
                      {p ? (
                        <Text style={{ color: theme.text, fontWeight: '700', marginTop: 2 }}>
                          {p.main} <Text style={{ color: theme.textSecondary, fontWeight: '500', fontSize: 12 }}>{p.unit}</Text>
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={styles.links}>
            {plans ? (
              <Pressable onPress={() => void offer.restore()} disabled={busy !== null} hitSlop={6} accessibilityRole="button">
                <Text style={[styles.link, { color: theme.primary }]}>{t('upgrade.restore')}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => { close(); router.push('/redeem'); }} hitSlop={6} accessibilityRole="button">
              <Text style={[styles.link, { color: theme.primary }]}>{t('upgrade.haveCode')}</Text>
            </Pressable>
            <Pressable onPress={() => { close(); router.push('/upgrade'); }} hitSlop={6} accessibilityRole="button" style={styles.linkRow}>
              <Text style={[styles.link, { color: theme.primary }]}>{t('membership.comparePlans')}</Text>
              <Icon name={forward} size={14} color={theme.primary} />
            </Pressable>
          </View>

          {plans ? (
            <Text style={{ color: theme.textTertiary, fontSize: 11, lineHeight: 16, marginTop: Spacing.sm }}>
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
        </ScrollView>

        <View style={{ paddingTop: Spacing.sm, paddingBottom: insets.bottom + Spacing.sm }}>
          {primary}
          <Button label={t('membership.notNow')} variant="ghost" onPress={close} style={{ marginTop: Spacing.xs }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(33,27,46,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.sm,
  },
  grabber: { width: 60, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.xs },
  close: { position: 'absolute', top: Spacing.sm, end: Spacing.sm, width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  hero: { alignItems: 'center', gap: 6, marginTop: Spacing.md, marginBottom: Spacing.md, paddingHorizontal: Spacing.lg },
  badge: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  center: { textAlign: 'center' },
  reason: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.ms, marginBottom: Spacing.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms },
  featureIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tiers: { flexDirection: 'row', gap: Spacing.sm },
  tier: { flex: 1, borderRadius: Radius.md, padding: Spacing.ms, minHeight: 64, justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.lg, rowGap: Spacing.xs, marginTop: Spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  link: { fontWeight: '700', fontSize: 14, minHeight: 24 },
});
