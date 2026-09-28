import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { PlanPicker, usePlanAction } from '@/components/plan-picker';
import { Button } from '@/components/ui';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SERVER_URL } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { reasonText, useStoreOffer } from '@/lib/use-store-offer';

/**
 * The membership sheet: "What do you want help with?" and the plan that
 * answers it — Essentials for Food or Training, Pro for both — with the
 * store's price, the free trial and a way to start it without leaving the
 * sheet; and always a way out (X, "Not now", or a tap outside). It opens after
 * onboarding, when a plan doesn't cover something, and from Profile.
 */
export default function Membership() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const used = useEntitlement((s) => s.used);
  const limit = useEntitlement((s) => s.limit);
  const offer = useStoreOffer(reason);
  const { plans, storeName, busy } = offer;

  // Opened by a link with nothing behind it, closing lands on Overview.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const action = usePlanAction(offer, close);
  const forward = i18n.dir?.() === 'rtl' ? 'chevron-back' : 'chevron-forward';

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
            <Text style={[Type.title, styles.center, { color: theme.text }]} accessibilityRole="header">
              {t('membership.title')}
            </Text>
            <Text style={[styles.center, { color: theme.textSecondary, fontSize: 15, lineHeight: 21 }]}>{t('membership.subtitle')}</Text>
          </View>

          {reason ? (
            <View style={[styles.reason, { backgroundColor: theme.cardSubtle, borderColor: theme.warning }]}>
              <Text style={{ color: theme.warningText, fontWeight: '600' }}>{reasonText(t, reason, used ?? 0, limit ?? 0)}</Text>
            </View>
          ) : null}

          <PlanPicker offer={offer} />

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
          {action.terms ? (
            <Text style={[styles.center, { color: theme.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: Spacing.xs }]}>{action.terms}</Text>
          ) : null}
          <Button label={action.label} loading={action.loading} disabled={action.disabled} onPress={action.onPress} />
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
  hero: { alignItems: 'center', gap: 6, marginTop: Spacing.lg, marginBottom: Spacing.md, paddingHorizontal: Spacing.lg },
  center: { textAlign: 'center' },
  reason: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.ms, marginBottom: Spacing.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms },
  featureTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierTag: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  featureIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tiers: { flexDirection: 'row', gap: Spacing.sm },
  tier: { flex: 1, borderRadius: Radius.md, padding: Spacing.ms, minHeight: 64, justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.lg, rowGap: Spacing.xs, marginTop: Spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  link: { fontWeight: '700', fontSize: 14, minHeight: 24 },
});
