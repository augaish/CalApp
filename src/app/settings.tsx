import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { RowGroup, SettingsRow } from '@/components/system';
import { Screen } from '@/components/ui';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';
import type { Language, Units } from '@/lib/types';

/**
 * Settings — how the app behaves, behind the gear on Profile. Profile keeps
 * what is about the person (account, plan, goals, help); everything here is
 * about the app itself. Each row opens the same picker or screen it did when
 * it lived on Profile.
 */
export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setLanguage = useAppStore((s) => s.setLanguage);
  const units = useAppStore((s) => s.units);
  const setUnits = useAppStore((s) => s.setUnits);
  const appearance = useAppStore((s) => s.appearance) ?? 'light';
  const setAppearance = useAppStore((s) => s.setAppearance);

  const switchLanguage = (lang: Language) => {
    if (lang === language) return;
    setLanguage(lang);
    setI18nLanguage(lang);
    if (applyRTL(lang)) {
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

  const chooseLanguage = () =>
    Alert.alert(t('settings.language'), undefined, [
      { text: t('settings.english'), onPress: () => switchLanguage('en') },
      { text: t('settings.arabic'), onPress: () => switchLanguage('ar') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const chooseAppearance = () =>
    Alert.alert(t('appearance.title'), t('appearance.note'), [
      { text: t('appearance.system'), onPress: () => setAppearance('system') },
      { text: t('appearance.light'), onPress: () => setAppearance('light') },
      { text: t('appearance.dark'), onPress: () => setAppearance('dark') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const chooseUnits = () =>
    Alert.alert(t('units.title'), t('units.note'), [
      { text: t('units.metric'), onPress: () => setUnits('metric' as Units) },
      { text: t('units.imperial'), onPress: () => setUnits('imperial' as Units) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const unitsLabel = units === 'imperial' ? `${t('units.lb')} / ${t('units.in')}` : `${t('progress.kg')} / ${t('units.cm')}`;

  return (
    <Screen header={<PageHeader title={t('settings.title')} backLabel={t('profile.title')} />}>
      <RowGroup>
        <SettingsRow icon="globe-outline" title={t('settings.language')} value={language === 'ar' ? t('settings.arabic') : t('settings.english')} onPress={chooseLanguage} />
        <SettingsRow icon="resize-outline" title={t('units.title')} value={unitsLabel} onPress={chooseUnits} />
        <SettingsRow icon="contrast-outline" title={t('appearance.title')} value={t(`appearance.${appearance}`)} onPress={chooseAppearance} />
        <SettingsRow icon="notifications-outline" title={t('notifications.title')} onPress={() => router.push('/notifications')} last />
      </RowGroup>
      <RowGroup>
        <SettingsRow icon="shield-checkmark-outline" title={t('profile.privacyData')} onPress={() => router.push('/privacy')} />
        <SettingsRow icon="pricetag-outline" title={t('redeem.title')} onPress={() => router.push('/redeem')} last />
      </RowGroup>
    </Screen>
  );
}
