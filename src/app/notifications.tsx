import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { Icon } from '@/components/icon';
import { EmptyState, InfoLine, RowGroup, Segmented, SettingsRow } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { usePlanGate } from '@/hooks/use-plan-gate';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { DEFAULT_PREFS } from '@/lib/notify/planner';
import { notificationsGranted, plannedPreview, syncReminders } from '@/lib/reminders';
import { exactRestAlerts, openExactAlarmSettings } from '@/lib/rest-live-activity';
import { useAppStore } from '@/lib/store';

type Kind = 'food' | 'water' | 'training';
const ICON: Record<Kind, 'restaurant-outline' | 'water-outline' | 'barbell-outline'> = {
  food: 'restaurant-outline',
  water: 'water-outline',
  training: 'barbell-outline',
};

function hourLabel(h: number): string {
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
}

/** − 23:00 + — one end of the quiet hours. */
function HourStepper({ value, onChange, label }: { value: number; onChange: (h: number) => void; label: string }) {
  const theme = useTheme();
  const step = (d: number) => {
    lightHaptic();
    onChange((value + d + 24) % 24);
  };
  return (
    <View style={styles.stepper} accessibilityLabel={`${label} ${hourLabel(value)}`}>
      <Pressable onPress={() => step(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${label} −1`} style={[styles.stepBtn, { backgroundColor: theme.cardSubtle }]}>
        <Icon name="remove" size={16} color={theme.primary} />
      </Pressable>
      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{hourLabel(value)}</Text>
      <Pressable onPress={() => step(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${label} +1`} style={[styles.stepBtn, { backgroundColor: theme.cardSubtle }]}>
        <Icon name="add" size={16} color={theme.primary} />
      </Pressable>
    </View>
  );
}

/**
 * S33 Notifications — one main switch and three areas (Food, Water,
 * Training); recaps and wins come with whatever is on. Areas outside the plan
 * (Essentials covers one) say so instead of pretending. Quiet hours and a
 * daily maximum, and a preview of what is planned, so nothing arrives as a
 * surprise. A denied OS permission offers Open settings instead of asking again.
 */
export default function Notifications() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const gate = usePlanGate();
  const remind = {
    food: useAppStore((s) => s.remindMeals),
    water: useAppStore((s) => s.remindWater),
    training: useAppStore((s) => s.remindWorkouts),
  };
  const setters = {
    food: useAppStore((s) => s.setRemindMeals),
    water: useAppStore((s) => s.setRemindWater),
    training: useAppStore((s) => s.setRemindWorkouts),
  };
  const prefs = { ...DEFAULT_PREFS, ...(useAppStore((s) => s.notifyPrefs) ?? {}) };
  const setNotifyPrefs = useAppStore((s) => s.setNotifyPrefs);
  const [granted, setGranted] = useState<boolean | null>(null);
  // The next two days of the plan, with whether each is today — read from
  // the clock here, never while drawing.
  const upcomingNow = () => {
    const now = new Date();
    return plannedPreview(now)
      .filter((p) => p.at.getTime() - now.getTime() < 2 * 86_400_000)
      .slice(0, 6)
      .map((p) => ({ ...p, isToday: p.at.toDateString() === now.toDateString() }));
  };
  const [upcoming, setUpcoming] = useState(upcomingNow);
  const refreshPreview = useCallback(() => setUpcoming(upcomingNow()), []);

  useEffect(() => {
    let alive = true;
    notificationsGranted().then((g) => {
      if (alive) setGranted(g);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Android 14+: whether the rest timer's alert may be exact. Read again on
  // return from system settings, where the person allows it.
  const [exact, setExact] = useState(exactRestAlerts);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setExact(exactRestAlerts());
    });
    return () => sub.remove();
  }, []);

  // Which areas the plan covers: Essentials Food has no Training, and so on.
  const covered: Record<Kind, boolean> = {
    food: !gate.readOnly && gate.isOpen('food'),
    water: !gate.readOnly && gate.isOpen('health'),
    training: !gate.readOnly && gate.isOpen('training'),
  };

  const apply = async (revert: () => void) => {
    const result = await syncReminders();
    // Where there is no notification system at all (web), there is nothing to refuse.
    const available = (await notificationsGranted()) !== null;
    if (available) setGranted(result.granted);
    if (available && !result.granted) {
      // Kept off rather than pretending a reminder will arrive.
      revert();
      await syncReminders();
    }
    refreshPreview();
  };

  const setMaster = async (on: boolean) => {
    lightHaptic();
    setNotifyPrefs({ enabled: on });
    await apply(() => setNotifyPrefs({ enabled: false }));
  };

  const setKind = async (kind: Kind, on: boolean) => {
    lightHaptic();
    setters[kind](on);
    await apply(() => setters[kind](false));
  };

  const setPref = async (p: Parameters<typeof setNotifyPrefs>[0]) => {
    setNotifyPrefs(p);
    await syncReminders();
    refreshPreview();
  };

  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const when = (d: Date, isToday: boolean) => {
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return isToday ? t('notifications.today', { time }) : `${d.toLocaleDateString(locale, { weekday: 'short' })} ${time}`;
  };

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

      {exact === false && (
        <RowGroup style={styles.group}>
          <SettingsRow
            icon="alarm-outline"
            title={t('notifications.exactTitle')}
            subtitle={t('notifications.exactHint')}
            onPress={openExactAlarmSettings}
            last
          />
        </RowGroup>
      )}

      <RowGroup style={styles.group}>
        <SettingsRow
          icon="notifications-outline"
          title={t('notifications.master')}
          subtitle={t('notifications.masterHint')}
          chevron={false}
          last
          right={
            <Switch
              value={prefs.enabled}
              onValueChange={(v) => void setMaster(v)}
              accessibilityLabel={t('notifications.master')}
              trackColor={{ true: theme.primary, false: theme.border }}
            />
          }
        />
      </RowGroup>

      {prefs.enabled && (
        <>
          <RowGroup style={styles.group} title={t('notifications.areas')}>
            {(['food', 'water', 'training'] as Kind[]).map((k, i) => (
              <SettingsRow
                key={k}
                icon={ICON[k]}
                title={t(`notifications.kind.${k}`)}
                subtitle={covered[k] ? t(`notifications.kindHint.${k}`) : t('notifications.notInPlan')}
                chevron={false}
                last={i === 2}
                right={
                  <Switch
                    value={covered[k] && remind[k]}
                    disabled={!covered[k]}
                    onValueChange={(v) => void setKind(k, v)}
                    accessibilityLabel={t(`notifications.kind.${k}`)}
                    trackColor={{ true: theme.primary, false: theme.border }}
                  />
                }
              />
            ))}
          </RowGroup>
          <InfoLine icon="sparkles-outline">{t('notifications.winsNote')}</InfoLine>
          <View style={{ height: Spacing.sm }} />

          <RowGroup style={styles.group} title={t('notifications.timing')}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>{t('notifications.quietFrom')}</Text>
              <HourStepper value={prefs.quietStart} onChange={(h) => void setPref({ quietStart: h })} label={t('notifications.quietFrom')} />
            </View>
            <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>{t('notifications.quietUntil')}</Text>
              <HourStepper value={prefs.quietEnd} onChange={(h) => void setPref({ quietEnd: h })} label={t('notifications.quietUntil')} />
            </View>
            <View style={[styles.rowColumn, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 15, marginBottom: Spacing.sm }}>{t('notifications.perDay')}</Text>
              <Segmented
                options={[2, 3, 4, 6].map((n) => ({ key: String(n), label: String(n) }))}
                value={String(prefs.maxPerDay)}
                onChange={(k) => void setPref({ maxPerDay: Number(k) })}
              />
            </View>
          </RowGroup>

          <RowGroup style={styles.group} title={t('notifications.comingUp')}>
            {upcoming.length === 0 ? (
              <View style={styles.rowColumn}>
                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{t('notifications.nothingPlanned')}</Text>
              </View>
            ) : (
              upcoming.map((p, i) => (
                <View key={p.id} style={[styles.rowColumn, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                  <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>{when(p.at, p.isToday)}</Text>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{p.title}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 1 }}>{p.body}</Text>
                </View>
              ))
            )}
          </RowGroup>
          <InfoLine>{t('notifications.planNote')}</InfoLine>
          {Platform.OS !== 'web' && <InfoLine icon="hand-left-outline">{t('notifications.buttonsNote')}</InfoLine>}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, minHeight: 52 },
  rowColumn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.ms },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 32, height: 32, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
});
