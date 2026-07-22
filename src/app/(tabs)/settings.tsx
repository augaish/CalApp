import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Card, OptionRow, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';
import type { Language } from '@/lib/types';

export default function Settings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setLanguage = useAppStore((s) => s.setLanguage);
  const targets = useAppStore((s) => s.targets);
  const profile = useAppStore((s) => s.profile);

  const switchLanguage = (lang: Language) => {
    if (lang === language) return;
    setLanguage(lang);
    setI18nLanguage(lang);
    const needsReload = applyRTL(lang);
    if (needsReload) {
      Alert.alert(t('settings.restartNeeded'), t('settings.restartBody'), [
        {
          text: t('settings.restartNow'),
          onPress: async () => {
            try {
              await Updates.reloadAsync();
            } catch {
              // Dev / Expo Go: direction fully applies on next app start.
            }
          },
        },
      ]);
    }
  };

  return (
    <Screen>
      <Title>{t('settings.title')}</Title>

      <Text style={[styles.section, { color: theme.textSecondary }]}>{t('settings.language')}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <OptionRow label={t('settings.english')} selected={language === 'en'} onPress={() => switchLanguage('en')} />
        </View>
        <View style={styles.flex}>
          <OptionRow label={t('settings.arabic')} selected={language === 'ar'} onPress={() => switchLanguage('ar')} />
        </View>
      </View>

      {targets && profile && (
        <>
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            {t('settings.dailyTargets')}
          </Text>
          <Card>
            <Row label={t('onboarding.dailyCalories')} value={`${targets.calories} ${t('common.kcal')}`} />
            <Row label={t('onboarding.protein')} value={`${targets.proteinG} ${t('common.grams')}`} />
            <Row label={t('onboarding.carbs')} value={`${targets.carbsG} ${t('common.grams')}`} />
            <Row label={t('onboarding.fat')} value={`${targets.fatG} ${t('common.grams')}`} />
          </Card>
        </>
      )}

      <Text style={[styles.section, { color: theme.textSecondary }]}>{t('settings.about')}</Text>
      <Card>
        <Row label={t('settings.version')} value={Constants.expoConfig?.version ?? '1.0.0'} />
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.kvRow}>
      <Text style={{ color: theme.text, fontSize: 16 }}>{label}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 16 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
});
