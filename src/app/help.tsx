import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { InfoLine, RowGroup, SettingsRow } from '@/components/system';
import { Screen } from '@/components/ui';
import { useAppStore } from '@/lib/store';

/** S20 Help & feedback — the tour, the guides and a way to reach us. */
export default function Help() {
  const { t } = useTranslation();
  const router = useRouter();
  const replayTour = useAppStore((s) => s.replayTour);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const update = Updates.updateId ?? undefined;

  return (
    <Screen header={<PageHeader title={t('profile.help')} />}>
      <RowGroup title={t('help.learn')}>
        <SettingsRow
          icon="sparkles-outline"
          title={t('tour.replay')}
          subtitle={t('help.tourHint')}
          onPress={() => {
            replayTour();
            router.dismissTo('/(tabs)');
          }}
          last
        />
      </RowGroup>
      <RowGroup title={t('help.contact')}>
        <SettingsRow icon="mail-outline" title={t('help.feedback')} subtitle={t('help.feedbackHint')} onPress={() => Linking.openURL(`mailto:${t('help.email')}?subject=Calgym%20${version}`)} last />
      </RowGroup>
      <RowGroup>
        <SettingsRow icon="information-circle-outline" title={t('settings.version')} value={update ? `${version} · ${update.slice(0, 8)}` : version} chevron={false} last />
      </RowGroup>
      <InfoLine>{t('help.note')}</InfoLine>
    </Screen>
  );
}
