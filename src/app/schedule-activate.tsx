import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { DayStrip, IconTile, InfoLine } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { exerciseName, findExercise } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';

import { scheduleIcon } from './schedules';
import { estimateMinutes } from './(tabs)/training';

/** The week (Sunday-first) containing a day. */
function weekOf(day: Date): Date[] {
  const start = new Date(day);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * S08 Activation preview — the chosen week's contents, today before → after,
 * and the explicit effective date. Zero writes before Activate; Activate
 * atomically selects one schedule and stamps the date. Completed sets,
 * personal bests, body readings and eaten food are untouched, and a
 * session already underway keeps its captured targets.
 */
export default function ScheduleActivate() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  const saved = useAppStore((s) => s.savedSchedules);
  const activeId = useAppStore((s) => s.activeScheduleId);
  const schedule = useAppStore((s) => s.schedule);
  const custom = useAppStore((s) => s.exercises);
  const activeSession = useAppStore((s) => s.activeSession);
  const activateSchedule = useAppStore((s) => s.activateSchedule);

  const target = saved.find((s) => s.id === id);
  const current = saved.find((s) => s.id === activeId);
  const today = new Date();
  const week = weekOf(today);
  const [selected, setSelected] = useState<Date>(today);

  if (!target) {
    return (
      <Screen header={<PageHeader title={t('schedules.title')} />}>
        <Text style={{ color: theme.textSecondary }}>{t('schedules.notFound')}</Text>
      </Screen>
    );
  }

  const name = target.name || t('schedules.defaultName');
  const currentName = current ? current.name || t('schedules.defaultName') : t('today.myPlan');
  const isActive = target.id === activeId;
  const dayOf = (days: typeof target.days, d: Date) => days[d.getDay()];
  const trainingDays = week.filter((d) => (dayOf(target.days, d)?.exerciseIds.length ?? 0) > 0);
  const before = schedule[today.getDay()];
  const after = dayOf(target.days, today);
  const summary = (d?: { exerciseIds: string[]; plans?: Record<string, unknown[]> }) => {
    if (!d || d.exerciseIds.length === 0) return t('today.restDay');
    const sets = d.exerciseIds.reduce((sum, ex) => sum + ((d.plans?.[ex]?.length as number | undefined) ?? 0), 0);
    return `${t('training.aboutMinutes', { n: estimateMinutes(d.exerciseIds.length, sets) })} · ${t('training.exerciseCount', { count: d.exerciseIds.length })}`;
  };
  const selectedDay = dayOf(target.days, selected);
  const rangeLabel = `${week[0].toLocaleDateString(locale, { day: 'numeric' })}–${week[6].toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;

  const activate = () => {
    activateSchedule(target.id);
    successHaptic();
    router.replace('/(tabs)/training');
  };

  return (
    <Screen
      header={<PageHeader title={t('activate.title', { name })} />}
      footer={
        <View style={{ gap: Spacing.xs }}>
          {isActive ? (
            <Button label={t('schedules.viewWeek')} onPress={() => router.replace('/schedule')} />
          ) : (
            <Button label={t('activate.activate', { name })} onPress={activate} />
          )}
          <Button label={isActive ? t('common.back') : t('activate.keep', { name: currentName })} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/schedules'))} />
        </View>
      }
    >
      <View style={styles.titleRow}>
        <Text style={[Type.section, { color: theme.text, flex: 1 }]}>{t('activate.preview')}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('activate.weekOf', { range: rangeLabel })}</Text>
      </View>
      <DayStrip days={week} selected={selected} onSelect={setSelected} locale={locale} />

      <View style={[styles.card, { backgroundColor: theme.card, marginTop: Spacing.md }, cardShadow(theme.shadow)]}>
        {trainingDays.length === 0 && <Text style={{ color: theme.textSecondary }}>{t('schedules.emptyWeek')}</Text>}
        {trainingDays.map((d, i) => {
          const day = dayOf(target.days, d)!;
          const on = d.toDateString() === selected.toDateString();
          return (
            <Pressable key={d.toDateString()} onPress={() => setSelected(d)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.dayRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <IconTile icon="barbell" size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{day.title || t('training.todaysWorkout')}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{summary(day)}</Text>
              </View>
              <Ionicons name={on ? 'chevron-down' : 'chevron-forward'} size={18} color={theme.textTertiary} />
            </Pressable>
          );
        })}
        {selectedDay && selectedDay.exerciseIds.length > 0 && (
          <View style={[styles.exercises, { backgroundColor: theme.surfaceTint }]}>
            <Text style={[Type.eyebrow, { color: theme.textSecondary, marginBottom: 4 }]}>{selected.toLocaleDateString(locale, { weekday: 'long' })}</Text>
            {selectedDay.exerciseIds.map((exId, i) => {
              const ex = findExercise(exId, custom);
              const sets = selectedDay.plans?.[exId]?.length ?? 0;
              return (
                <Text key={exId} style={{ color: theme.text, fontSize: 14, lineHeight: 22 }}>
                  {i + 1}. {ex ? exerciseName(ex, locale) : exId}
                  {sets > 0 ? <Text style={{ color: theme.textSecondary }}> · {t('training.setsOnly', { count: sets })}</Text> : null}
                </Text>
              );
            })}
          </View>
        )}
      </View>

      <Text style={[Type.section, { color: theme.text, marginBottom: Spacing.sm }]}>{t('activate.whatChanges')}</Text>
      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <View style={styles.beforeAfter}>
          <View style={[styles.side, { backgroundColor: theme.surfaceTint }]}>
            <IconTile icon={current ? scheduleIcon(current.name) : 'barbell-outline'} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{t('activate.before')}</Text>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                {currentName} · {before?.title || (before?.exerciseIds.length ? t('training.todaysWorkout') : t('today.restDay'))}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }} numberOfLines={2}>{summary(before)}</Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={18} color={theme.textTertiary} />
          <View style={[styles.side, { backgroundColor: theme.surfaceTint, borderWidth: 1, borderColor: theme.primary }]}>
            <IconTile icon={scheduleIcon(target.name)} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[Type.eyebrow, { color: theme.primaryDark }]}>{t('activate.after')}</Text>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                {name} · {after?.title || (after?.exerciseIds.length ? t('training.todaysWorkout') : t('today.restDay'))}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }} numberOfLines={2}>{summary(after)}</Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: Spacing.sm, gap: 2 }}>
          <InfoLine icon="calendar-outline">{t('activate.startsToday', { date: today.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) })}</InfoLine>
          <InfoLine icon="list-outline">{t('activate.setsUnchanged')}</InfoLine>
          <InfoLine icon="stats-chart-outline">{t('activate.futureFollow')}</InfoLine>
          {activeSession && <InfoLine icon="play-outline">{t('activate.sessionUnderway')}</InfoLine>}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.ms },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, paddingVertical: Spacing.ms, minHeight: 56 },
  exercises: { borderRadius: Radius.control, padding: Spacing.ms, marginTop: Spacing.sm },
  beforeAfter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.control, padding: Spacing.sm, minHeight: 72 },
});
