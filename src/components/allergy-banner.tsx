import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { allergensIn } from '@/lib/allergens';
import { useAppStore } from '@/lib/store';

/**
 * "May contain: Nuts, Dairy" over a scanned meal or a recipe, when its names
 * mention one of your allergies (Profile → Plan preferences). It reads names,
 * not ingredients lists you can't see, so it says "may contain" — and a meal
 * with no banner is not a promise. Tapping it opens your allergies.
 */
export function AllergyBanner({ texts, style }: { texts: string[]; style?: object }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const prefs = useAppStore((s) => s.planPrefs);
  const allergies = prefs?.allergies ?? [];
  if (allergies.length === 0 && !prefs?.allergyOther) return null;
  const hits = allergensIn(texts.join(' · '), allergies, prefs?.allergyOther);
  if (hits.length === 0) return null;
  const names = [...new Set(hits)].map((h) => (allergies.includes(h) ? t(`allergy.${h}`) : h));
  return (
    <Pressable
      onPress={() => router.push('/plan-preferences')}
      accessibilityRole="button"
      accessibilityLabel={`${t('allergy.mayContain', { list: names.join(', ') })}. ${t('allergy.where')}`}
      style={[styles.banner, { borderColor: theme.warning, backgroundColor: 'rgba(232,149,74,0.14)' }, style]}
    >
      <Icon name="warning-outline" size={20} color={theme.warningText} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.warningText, fontWeight: '800', fontSize: 15 }}>{t('allergy.mayContain', { list: names.join(', ') })}</Text>
        <Text style={{ color: theme.text, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{t('allergy.where')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', borderWidth: 1, borderRadius: Radius.md, padding: Spacing.ms, marginBottom: Spacing.md },
});
