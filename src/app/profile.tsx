import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { MembershipCard } from '@/components/plan-status';
import { PageHeader } from '@/components/brand-header';
import { RowGroup, SettingsRow } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { logOut } from '@/lib/account';
import { alertDestructive } from '@/lib/alerts';
import { lightHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';

/**
 * Profile — about the person: account, the explained sync route for a guest,
 * membership, goals and help (AI Support stays on every tab's header). How the app behaves (language, units,
 * appearance, notifications, privacy & data, codes) lives in Settings behind
 * the gear. Goal rows open editors; nothing here rewrites diary history.
 */
export default function Profile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const targets = useAppStore((s) => s.targets);
  const account = useAppStore((s) => s.account);
  const signOut = useAppStore((s) => s.signOut);
  const isGuest = !account?.email && account?.provider === 'guest';
  const name = account?.name?.trim() || t('profile.guest');
  const initial = !isGuest && account?.name?.trim() ? Array.from(account.name.trim())[0].toUpperCase() : null;

  /** Sync needs an identity first. Data on this device is kept and merged after sign-in. */
  const startSync = () =>
    Alert.alert(t('profile.syncTitle'), t('profile.syncBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('welcome.signIn'), onPress: () => signOut() },
    ]);

  const confirmSignOut = () =>
    alertDestructive(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: () => void runLogOut(false),
      },
    ]);

  const runLogOut = async (force: boolean) => {
    if ((await logOut(force)) === 'done') return;
    // Offline, most likely: the newest changes aren't in the account yet.
    alertDestructive(t('profile.signOutUnsavedTitle'), t('profile.signOutUnsaved'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOutAnyway'), style: 'destructive', onPress: () => void runLogOut(true) },
    ]);
  };


  return (
    <Screen
      header={
        <PageHeader
          title={t('profile.title')}
          right={
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
              style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.7 }]}
            >
              <Icon name="settings-outline" size={22} color={theme.onGradient} />
            </Pressable>
          }
        />
      }
    >
      <Pressable
        onPress={() => router.push('/edit-profile')}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${t('settings.editProfile')}`}
        style={({ pressed }) => [styles.account, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.avatar, { backgroundColor: theme.surfaceTint }]}>
          {initial ? (
            <Text style={{ color: theme.primary, fontSize: 24, fontWeight: '700' }}>{initial}</Text>
          ) : (
            <Icon name="person" size={30} color={theme.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }} numberOfLines={1}>
            {account?.email ?? t('profile.onThisDevice')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={20} color={theme.textTertiary} />
      </Pressable>

      {isGuest && (
        <RowGroup>
          <SettingsRow icon="cloud-outline" title={t('profile.syncTitle')} subtitle={t('profile.syncHint')} onPress={startSync} last />
        </RowGroup>
      )}

      <MembershipCard />

      <RowGroup>
        <SettingsRow
          icon="restaurant-outline"
          title={t('profile.foodTargets')}
          value={targets ? `${targets.calories} ${t('common.kcal')}` : undefined}
          onPress={() => router.push('/edit-targets')}
        />
        <SettingsRow icon="barbell-outline" title={t('profile.trainingPreferences')} onPress={() => router.push('/program')} last />
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

      {account?.email && (
        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('profile.signOut')}
          hitSlop={8}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}
        >
          <Icon name="log-out-outline" size={20} color={theme.danger} />
          <Text style={{ color: theme.danger, fontSize: 16, fontWeight: '700' }}>{t('profile.signOut')}</Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, minHeight: 48, marginTop: Spacing.sm, alignSelf: 'center', paddingHorizontal: Spacing.lg },
});
