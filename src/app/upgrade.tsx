import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PlanPicker, usePlanAction } from '@/components/plan-picker';
import { MembershipCard, UsageBreakdown } from '@/components/plan-status';
import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SERVER_URL } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { manageSubscription } from '@/lib/purchases';
import { reasonText, useStoreOffer } from '@/lib/use-store-offer';

/**
 * Membership: your plan and this month's AI use (with what it went on), then
 * the same Food / Training / Both picker the sheet uses, codes, and managing
 * or restoring a subscription.
 */
export default function Upgrade() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  const plan = useEntitlement((s) => s.plan);
  const used = useEntitlement((s) => s.used);
  const limit = useEntitlement((s) => s.limit);
  const promo = useEntitlement((s) => s.promo);
  const paying = plan === 'essentials' || plan === 'pro' || plan === 'proPlus';

  const offer = useStoreOffer(reason);
  const { plans, status, storeName, busy } = offer;
  const action = usePlanAction(offer, () => router.back());

  return (
    <Screen
      footer={
        <View>
          {action.terms ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: Spacing.xs }}>{action.terms}</Text>
          ) : null}
          <Button label={action.label} loading={action.loading} disabled={action.disabled} onPress={action.onPress} />
          {plans ? (
            <Button
              label={t('upgrade.restore')}
              variant="ghost"
              loading={busy === 'restore'}
              disabled={busy !== null}
              onPress={offer.restore}
              style={{ marginTop: Spacing.xs }}
            />
          ) : (
            <Button label={t('common.close')} variant="ghost" onPress={() => router.back()} style={{ marginTop: Spacing.xs }} />
          )}
        </View>
      }
    >
      <View style={styles.header}>
        <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', flex: 1 }} accessibilityRole="header">{t('plans.membershipTitle')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      <MembershipCard />
      {paying && !promo && status === 'ready' ? (
        <Pressable onPress={() => void manageSubscription()} style={{ marginTop: -Spacing.xs, marginBottom: Spacing.md }} accessibilityRole="link">
          <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('upgrade.manage')}</Text>
        </Pressable>
      ) : null}
      <UsageBreakdown />

      {reason ? (
        <Card style={{ borderColor: theme.warning, borderWidth: 1 }}>
          <Text style={{ color: theme.warningText, fontWeight: '600' }}>{reasonText(t, reason, used ?? 0, limit ?? 0)}</Text>
        </Card>
      ) : null}

      <PlanPicker offer={offer} />

      <Pressable
        onPress={() => router.push('/redeem')}
        style={[styles.codeRow, { borderColor: theme.border }]}
        accessibilityRole="button"
      >
        <Icon name="pricetag-outline" size={18} color={theme.primary} />
        <Text style={{ color: theme.primary, fontWeight: '700', flex: 1 }}>{t('upgrade.haveCode')}</Text>
        <Icon name={i18n.dir?.() === 'rtl' ? 'chevron-back' : 'chevron-forward'} size={16} color={theme.textTertiary} />
      </Pressable>

      <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm, lineHeight: 17 }}>{t('plans.keepsNote')}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    marginTop: Spacing.md,
  },
});
