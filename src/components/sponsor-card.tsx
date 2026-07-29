import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEntitlement } from '@/lib/entitlement';
import { lightHaptic } from '@/lib/feedback';

/**
 * The directly-rented sponsor slot, configured from the admin dashboard.
 * Shown to free users only — paying for Pro removes it, which is part of what
 * the subscription buys. Renders nothing when no sponsor is configured.
 */
export function SponsorCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const plan = useEntitlement((s) => s.plan);
  const sponsor = useEntitlement((s) => s.sponsor);

  if (!sponsor?.enabled || !sponsor.title) return null;
  if (plan && plan !== 'free') return null;

  const open = () => {
    const url = sponsor.linkUrl;
    if (!url || !/^https:\/\//.test(url)) return;
    lightHaptic();
    Linking.openURL(url);
  };

  return (
    <Pressable
      onPress={open}
      disabled={!sponsor.linkUrl}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        cardShadow(theme.shadow),
        pressed && sponsor.linkUrl ? { opacity: 0.75 } : null,
      ]}
    >
      {sponsor.imageUrl ? (
        <Image source={{ uri: sponsor.imageUrl }} style={styles.logo} contentFit="cover" />
      ) : (
        <View style={[styles.logo, styles.logoFallback, { backgroundColor: theme.cardSubtle }]}>
          <Ionicons name="storefront-outline" size={20} color={theme.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
          {sponsor.title}
        </Text>
        {sponsor.subtitle ? (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={2}>
            {sponsor.subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ color: theme.textTertiary, fontSize: 10, fontWeight: '700' }}>
          {t('sponsor.label')}
        </Text>
        {sponsor.linkUrl ? (
          <Ionicons name="open-outline" size={15} color={theme.textTertiary} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  logo: { width: 44, height: 44, borderRadius: Radius.sm },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
});
