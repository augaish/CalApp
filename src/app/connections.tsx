import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { ConnectionRow, WhoopConnectionRow, connectionStyles } from '@/components/connections';
import { InfoLine } from '@/components/system';
import { Card, Screen } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * S26 Health connections — each integration with its true state. A wearable
 * this build cannot talk to shows an availability label, never a Connect
 * button that does nothing; Apple Health is not offered on Android at all.
 */
export default function Connections() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Screen header={<PageHeader title={t('profile.connections')} />}>
      <Text style={[Type.body, { color: theme.textSecondary, marginBottom: Spacing.md, lineHeight: 22 }]}>{t('health.connectionsIntro')}</Text>
      <Card>
        <WhoopConnectionRow />
        {Platform.OS !== 'android' && (
          <>
            <View style={[connectionStyles.divider, { backgroundColor: theme.border }]} />
            <ConnectionRow icon="watch-outline" label={t('profile.appleHealth')} />
          </>
        )}
      </Card>
      <InfoLine>{t('health.connectionsNote')}</InfoLine>
    </Screen>
  );
}
