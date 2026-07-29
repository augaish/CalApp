import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEntitlement } from '@/lib/entitlement';

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
  const pro = plan === 'pro';

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

      {reason === 'quota' && (
        <Card style={{ borderColor: theme.warning, borderWidth: 1 }}>
          <Text style={{ color: theme.warning, fontWeight: '600' }}>
            {t('upgrade.quotaHit', { used: used ?? 0, limit: limit ?? 0 })}
          </Text>
        </Card>
      )}

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

      <Card>
        <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
          {t('upgrade.pricing')}
        </Text>
        <View style={styles.priceRow}>
          <View style={[styles.priceBox, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>13</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {t('upgrade.perMonth')}
            </Text>
          </View>
          <View style={[styles.priceBox, { borderColor: theme.primary, borderWidth: 2 }]}>
            <View style={[styles.saveBadge, { backgroundColor: theme.primary }]}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                {t('upgrade.save')}
              </Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>129</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('upgrade.perYear')}</Text>
          </View>
        </View>
        <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>
          {t('upgrade.freeNote')}
        </Text>
      </Card>
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
  priceRow: { flexDirection: 'row', gap: Spacing.sm },
  priceBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  saveBadge: {
    position: 'absolute',
    top: -9,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
