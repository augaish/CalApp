import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Switch } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { EmptyState, InfoLine, RowGroup, SettingsRow } from '@/components/system';
import { Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { notificationsGranted, syncReminders } from '@/lib/reminders';
import { useAppStore } from '@/lib/store';

/**
 * S33 Notifications — the reminder preferences as switches, with the system
 * permission state shown honestly: a preference does not imply the OS
 * permission, a denied state offers Open settings instead of asking again.
 */
export default function Notifications() {
  const { t } = useTranslation();
  const theme = useTheme();
  const remindMeals = useAppStore((s) => s.remindMeals);
  const remindWater = useAppStore((s) => s.remindWater);
  const remindWorkouts = useAppStore((s) => s.remindWorkouts);
  const setRemindMeals = useAppStore((s) => s.setRemindMeals);
  const setRemindWater = useAppStore((s) => s.setRemindWater);
  const setRemindWorkouts = useAppStore((s) => s.setRemindWorkouts);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    notificationsGranted().then((g) => {
      if (alive) setGranted(g);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (kind: 'meals' | 'water' | 'workouts', on: boolean) => {
    lightHaptic();
    const save = kind === 'meals' ? setRemindMeals : kind === 'water' ? setRemindWater : setRemindWorkouts;
    save(on);
    const result = await syncReminders();
    setGranted(result.granted);
    if (on && !result.granted) {
      // The preference is kept off rather than pretending a reminder will fire.
      save(false);
      await syncReminders();
    }
  };

  const rows: { kind: 'meals' | 'water' | 'workouts'; icon: 'restaurant-outline' | 'water-outline' | 'barbell-outline'; value: boolean }[] = [
    { kind: 'meals', icon: 'restaurant-outline', value: remindMeals },
    { kind: 'water', icon: 'water-outline', value: remindWater },
    { kind: 'workouts', icon: 'barbell-outline', value: remindWorkouts },
  ];

  return (
    <Screen header={<PageHeader title={t('notifications.title')} />}>
      {granted === false && (
        <EmptyState
          icon="notifications-off-outline"
          title={t('notifications.deniedTitle')}
          body={t('notifications.deniedBody')}
          action={
            Platform.OS === 'web'
              ? undefined
              : { label: t('notifications.openSettings'), icon: 'settings-outline', onPress: () => Linking.openSettings() }
          }
          compact
        />
      )}
      <RowGroup title={t('reminders.section')}>
        {rows.map((r, i) => (
          <SettingsRow
            key={r.kind}
            icon={r.icon}
            title={t(`reminders.${r.kind}`)}
            subtitle={t(`notifications.hint.${r.kind}`)}
            chevron={false}
            last={i === rows.length - 1}
            right={
              <Switch
                value={r.value}
                onValueChange={(v) => toggle(r.kind, v)}
                accessibilityLabel={t(`reminders.${r.kind}`)}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
            }
          />
        ))}
      </RowGroup>
      <InfoLine>{t('notifications.note')}</InfoLine>
    </Screen>
  );
}
