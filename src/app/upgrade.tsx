import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEntitlement } from '@/lib/entitlement';

/** Used until `/api/me` answers (and on a server that predates `pricing`) —
 * the same numbers this screen shipped with, so nothing ever renders blank. */
const FALLBACK = {
  pro: 13,
  proPlus: 25,
  proYearly: 129,
  currency: 'SAR',
  limits: { free: 15, pro: 150, proPlus: 500 },
  coachCap: 5,
};

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; key: string }[] = [
  { icon: 'camera', key: 'scan' },
  { icon: 'sparkles', key: 'describe' },
  { icon: 'barbell', key: 'equipment' },
  { icon: 'chatbubbles', key: 'coach' },
  { icon: 'infinite', key: 'limits' },
];

export default function Upgrade() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  const plan = useEntitlement((s) => s.plan);
  const used = useEntitlement((s) => s.used);
  const limit = useEntitlement((s) => s.limit);
  const pricing = useEntitlement((s) => s.pricing);
  const pro = plan === 'pro' || plan === 'proPlus';

  // Server-set where available, this screen's own numbers otherwise.
  const currency = pricing?.currency ?? FALLBACK.currency;
  const limits = { ...FALLBACK.limits, ...(pricing?.limits ?? {}) };
  const coachCap = pricing?.coachCap ?? FALLBACK.coachCap;
  const yearly = pricing?.proYearly ?? FALLBACK.proYearly;
  const monthly = pricing?.pro ?? FALLBACK.pro;
  // "Save N%" only holds while the yearly price really is a discount.
  const savePct = monthly > 0 ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;

  const tiers = [
    {
      id: 'free' as const,
      name: t('upgrade.tierFree'),
      desc: t('upgrade.tierFreeDesc', { count: limits.free, coach: coachCap }),
      price: 0,
    },
    {
      id: 'pro' as const,
      name: t('upgrade.tierPro'),
      desc: t('upgrade.tierProDesc', { count: limits.pro }),
      price: monthly,
      highlight: true,
    },
    {
      id: 'proPlus' as const,
      name: t('upgrade.tierProPlus'),
      desc: t('upgrade.tierProPlusDesc', { count: limits.proPlus }),
      price: pricing?.proPlus ?? FALLBACK.proPlus,
    },
  ];

  return (
    <Screen
      footer={
        <View>
          {/* Billing is not live yet: be honest rather than showing a dead
              "Subscribe" button. Swapped for the real purchase flow when the
              store products exist. */}
          <Button label={t('upgrade.soon')} disabled onPress={() => {}} />
          <Button
            label={t('common.close')}
            variant="ghost"
            onPress={() => router.back()}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Ionicons name="sparkles" size={30} color="#fff" />
        <Text style={styles.heroTitle}>{t('upgrade.title')}</Text>
        <Text style={styles.heroSub}>{t('upgrade.subtitle')}</Text>
      </LinearGradient>

      {reason ? (
        <Card style={{ borderColor: theme.warning, borderWidth: 1 }}>
          <Text style={{ color: theme.warning, fontWeight: '600' }}>
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
            <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
            <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>
              {t('upgrade.alreadyPro')}
            </Text>
          </View>
        </Card>
      )}

      <Card>
        {FEATURES.map((f, i) => (
          <View
            key={f.key}
            style={[
              styles.featureRow,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
            ]}
          >
            <View style={[styles.featureIcon, { backgroundColor: theme.cardSubtle }]}>
              <Ionicons name={f.icon} size={17} color={theme.primary} />
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
      {tiers.map((tier) => {
        const current = plan === tier.id;
        return (
          <Card
            key={tier.id}
            style={tier.highlight ? { borderColor: theme.primary, borderWidth: 2 } : undefined}
          >
            <View style={styles.tierHead}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', flex: 1 }}>
                {tier.name}
              </Text>
              {current && (
                <View style={[styles.currentBadge, { backgroundColor: theme.cardSubtle }]}>
                  <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '800' }}>
                    {t('upgrade.current')}
                  </Text>
                </View>
              )}
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>
                {tier.price}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {tier.price === 0 ? '' : t('upgrade.perMonthShort', { currency })}
              </Text>
            </View>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>
              {tier.desc}
            </Text>
            {tier.id === 'pro' && yearly > 0 && (
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                {savePct > 0
                  ? t('upgrade.yearly', { price: yearly, currency, percent: savePct })
                  : t('upgrade.yearlyPlain', { price: yearly, currency })}
              </Text>
            )}
          </Card>
        );
      })}
      <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.xs }}>
        {t('upgrade.freeNote')}
      </Text>
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
});
