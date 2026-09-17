import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { InfoLine, RowGroup, SettingsRow } from '@/components/system';
import { Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { deleteAccount } from '@/lib/account';
import { SERVER_URL } from '@/lib/api';
import { signOutAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';

/**
 * S20 Privacy and permissions — what is shared with AI Support, the policy
 * documents, and the destructive account actions, each behind its own
 * confirmation. Nothing here happens on a single tap.
 */
export default function Privacy() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const account = useAppStore((s) => s.account);
  const signOut = useAppStore((s) => s.signOut);
  const resetAll = useAppStore((s) => s.resetAll);

  const confirmSignOut = () =>
    Alert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOutAuth();
          signOut();
        },
      },
    ]);

  const confirmReset = () =>
    Alert.alert(t('settings.resetData'), t('settings.resetDataConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.reset'), style: 'destructive', onPress: () => resetAll() },
    ]);

  const confirmDeleteAccount = () =>
    Alert.alert(t('legal.deleteAccount'), t('legal.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('legal.deleteConfirmCta'),
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteAccount();
          if (!ok) Alert.alert(t('legal.deletePartial'));
        },
      },
    ]);

  return (
    <Screen header={<PageHeader title={t('profile.privacy')} />}>
      <RowGroup title={t('privacy.sharing')}>
        <SettingsRow icon="sparkles-outline" title={t('coach.manageContext')} subtitle={t('privacy.aiHint')} onPress={() => router.push('/coach-memory')} />
        <SettingsRow icon="notifications-outline" title={t('notifications.title')} onPress={() => router.push('/notifications')} />
        <SettingsRow icon="link-outline" title={t('profile.connections')} subtitle={t('privacy.connectionsHint')} onPress={() => router.push('/connections')} last />
      </RowGroup>
      <RowGroup title={t('legal.section')}>
        <SettingsRow icon="shield-checkmark-outline" title={t('legal.privacy')} onPress={() => Linking.openURL(`${SERVER_URL}/privacy`)} />
        <SettingsRow icon="document-text-outline" title={t('legal.terms')} onPress={() => Linking.openURL(`${SERVER_URL}/terms`)} last />
      </RowGroup>
      <RowGroup title={t('privacy.dangerZone')}>
        {account?.email && <SettingsRow icon="log-out-outline" iconColor={theme.danger} title={t('profile.signOut')} onPress={confirmSignOut} chevron={false} />}
        <SettingsRow icon="trash-outline" iconColor={theme.danger} title={t('settings.resetData')} subtitle={t('privacy.resetHint')} onPress={confirmReset} chevron={false} />
        <SettingsRow icon="person-remove-outline" iconColor={theme.danger} title={t('legal.deleteAccount')} subtitle={t('privacy.deleteHint')} onPress={confirmDeleteAccount} chevron={false} last />
      </RowGroup>
      <InfoLine>{t('privacy.note')}</InfoLine>
    </Screen>
  );
}
