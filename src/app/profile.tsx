import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { RowGroup, SettingsRow, StatusPill } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildExport } from '@/lib/account';
import { useEntitlement } from '@/lib/entitlement';
import { lightHaptic } from '@/lib/feedback';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';
import type { Language, Units } from '@/lib/types';

/**
 * S20 Profile — account status stated as it is (Guest or signed in), an
 * explained sync route, then Preferences, Goals and Account groups. Goal
 * rows open editors; nothing here rewrites diary history. Connections live
 * in Health; AI Support stays a labelled route.
 */
export default function Profile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setLanguage = useAppStore((s) => s.setLanguage);
  const units = useAppStore((s) => s.units);
  const setUnits = useAppStore((s) => s.setUnits);
  const targets = useAppStore((s) => s.targets);
  const account = useAppStore((s) => s.account);
  const signOut = useAppStore((s) => s.signOut);
  const plan = useEntitlement((s) => s.plan);
  const remaining = useEntitlement((s) => s.remaining);
  const limit = useEntitlement((s) => s.limit);
  const isGuest = !account?.email && account?.provider === 'guest';

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

  const chooseUnits = () =>
    Alert.alert(t('units.title'), t('units.note'), [
      { text: t('units.metric'), onPress: () => setUnits('metric' as Units) },
      { text: t('units.imperial'), onPress: () => setUnits('imperial' as Units) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  /** Sync needs an identity first. Data on this device is kept and merged after sign-in. */
  const startSync = () =>
    Alert.alert(t('profile.syncTitle'), t('profile.syncBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('welcome.signIn'), onPress: () => signOut() },
    ]);

  const exportData = async () => {
    try {
      await Share.share({ message: buildExport() });
    } catch {
      // share sheet dismissed — nothing to do
    }
  };

  const planLabel = plan === 'proPlus' ? t('upgrade.planProPlus') : plan === 'pro' ? t('upgrade.planPro') : t('upgrade.planFree');
  const unitsLabel = units === 'imperial' ? `${t('units.lb')} / ${t('units.in')}` : `${t('progress.kg')} / ${t('units.cm')}`;

  return (
    <Screen header={<PageHeader title={t('profile.title')} />}>
      <Pressable
        onPress={() => router.push('/edit-profile')}
        accessibilityRole="button"
        accessibilityLabel={`${account?.name ?? t('profile.guest')}. ${t('settings.editProfile')}`}
        style={({ pressed }) => [styles.account, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.avatar, { backgroundColor: theme.surfaceTint }]}>
          <Ionicons name="person" size={34} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>
              {account?.name ?? t('profile.guest')}
            </Text>
            <StatusPill label={isGuest ? t('profile.guest') : t('profile.signedIn')} tone={isGuest ? 'neutral' : 'active'} />
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }} numberOfLines={1}>
            {account?.email ?? t('profile.onThisDevice')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
      </Pressable>

      {isGuest && (
        <RowGroup>
          <SettingsRow icon="cloud-outline" title={t('profile.syncTitle')} subtitle={t('profile.syncHint')} onPress={startSync} last />
        </RowGroup>
      )}

      <RowGroup title={t('profile.preferences')}>
        <SettingsRow icon="globe-outline" title={t('settings.language')} value={language === 'ar' ? t('settings.arabic') : t('settings.english')} onPress={chooseLanguage} />
        <SettingsRow icon="resize-outline" title={t('units.title')} value={unitsLabel} onPress={chooseUnits} />
        <SettingsRow icon="notifications-outline" title={t('notifications.title')} onPress={() => router.push('/notifications')} last />
      </RowGroup>

      <RowGroup title={t('profile.goals')}>
        <SettingsRow
          icon="restaurant-outline"
          title={t('profile.foodTargets')}
          value={targets ? `${targets.calories} ${t('common.kcal')}` : undefined}
          onPress={() => router.push('/edit-targets')}
        />
        <SettingsRow icon="barbell-outline" title={t('profile.trainingPreferences')} onPress={() => router.push('/program')} last />
      </RowGroup>

      <RowGroup title={t('profile.account')}>
        <SettingsRow
          icon="star-outline"
          title={t('profile.membership')}
          value={planLabel}
          subtitle={typeof remaining === 'number' && typeof limit === 'number' ? t('upgrade.remaining', { remaining, limit }) : undefined}
          onPress={() => router.push('/upgrade')}
        />
        <SettingsRow icon="document-text-outline" title={t('legal.exportData')} onPress={exportData} />
        <SettingsRow icon="sparkles-outline" title={t('tabs.ai')} onPress={() => router.push('/coach')} />
        <SettingsRow icon="shield-checkmark-outline" title={t('profile.privacy')} onPress={() => router.push('/privacy')} last />
      </RowGroup>

      <RowGroup>
        <SettingsRow
          icon="help-circle-outline"
          title={t('profile.help')}
          onPress={() => {
            lightHaptic();
            router.push('/help');
          }}
          last
        />
      </RowGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
