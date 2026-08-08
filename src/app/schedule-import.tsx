import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { allExercises, exerciseName } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import { fetchSharedPlan } from '@/lib/api';
import { decodeSchedule, type SharedSchedule } from '@/lib/share';
import { useAppStore } from '@/lib/store';

function weekdayLabel(i: number, locale: string): string {
  return new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'long' });
}

export default function ScheduleImport() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  // `c` is a short code the plan is fetched by; `d` is the old inline payload,
  // still honoured so links shared before short codes keep working.
  const { c: code, d } = useLocalSearchParams<{ c?: string; d?: string }>();

  const custom = useAppStore((s) => s.exercises);
  const importSchedule = useAppStore((s) => s.importSchedule);

  const inline = useMemo(() => (d ? decodeSchedule(d) : null), [d]);
  const [fetched, setFetched] = useState<SharedSchedule | null>(null);
  const [loading, setLoading] = useState(!!code);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    fetchSharedPlan(code)
      .then((raw) => {
        if (!alive) return;
        const plan = raw as SharedSchedule | null;
        setFetched(plan && plan.v === 1 && plan.schedule ? plan : null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code]);

  const payload = inline ?? fetched;

  // Preview: how each weekday looks in the shared plan.
  const days = useMemo(() => {
    if (!payload) return [];
    const pool = allExercises([...custom, ...(payload.exercises ?? [])]);
    return Object.entries(payload.schedule)
      .map(([wd, day]) => ({
        weekday: Number(wd),
        title: day.title,
        names: day.exerciseIds.map((id) => {
          const ex = pool.find((e) => e.id === id);
          return ex ? exerciseName(ex, locale) : id;
        }),
      }))
      .filter((day) => day.names.length > 0)
      .sort((a, b) => a.weekday - b.weekday);
  }, [payload, custom, locale]);

  const totalExercises = days.reduce((n, day) => n + day.names.length, 0);

  const apply = () => {
    if (!payload) return;
    importSchedule({ schedule: payload.schedule, exercises: payload.exercises ?? [] });
    successHaptic();
    useCelebrate.getState().celebrate(t('scheduleImport.done'));
    router.replace('/(tabs)/training');
  };

  if (loading) {
    return (
      <Screen footer={<Button label={t('common.close')} onPress={() => router.back()} />}>
        <Title>{t('scheduleImport.title')}</Title>
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <ActivityIndicator color={theme.primary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            {t('scheduleImport.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (!payload || days.length === 0) {
    return (
      <Screen footer={<Button label={t('common.close')} onPress={() => router.replace('/(tabs)/training')} />}>
        <Title>{t('scheduleImport.title')}</Title>
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="alert-circle-outline" size={32} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            {t('scheduleImport.invalid')}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View>
          <Button label={t('scheduleImport.apply')} icon="download-outline" onPress={apply} />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            onPress={() => router.replace('/(tabs)/training')}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      }
    >
      <Title>{t('scheduleImport.title')}</Title>
      <Subtitle>
        {t('scheduleImport.summary', { days: days.length, exercises: totalExercises })}
      </Subtitle>

      <View style={[styles.warn, { backgroundColor: theme.cardSubtle }]}>
        <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
        <Text style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}>
          {t('scheduleImport.replaceNote')}
        </Text>
      </View>

      {days.map((day) => (
        <Card key={day.weekday}>
          <Text style={[styles.dayTitle, { color: theme.text }]}>
            {day.title || weekdayLabel(day.weekday, locale)}
          </Text>
          <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 6 }}>
            {weekdayLabel(day.weekday, locale)}
          </Text>
          {day.names.map((name, i) => (
            <View key={i} style={styles.exRow}>
              <Ionicons name="barbell-outline" size={15} color={theme.primary} />
              <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  dayTitle: { fontSize: 17, fontWeight: '700' },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
