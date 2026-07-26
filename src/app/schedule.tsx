import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useViewDay } from '@/lib/day';
import { exerciseName, findExercise } from '@/lib/exercises';
import { useAppStore } from '@/lib/store';

/** Labels for weekdays 0–6 in the active locale (Jan 7 2024 was a Sunday). */
function weekdayLabel(i: number, locale: string, format: 'short' | 'long'): string {
  return new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: format });
}

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const lang = locale;

  const schedule = useAppStore((s) => s.schedule);
  const custom = useAppStore((s) => s.exercises);
  const removeFromSchedule = useAppStore((s) => s.removeFromSchedule);
  const setScheduleTitle = useAppStore((s) => s.setScheduleTitle);
  const viewDay = useViewDay((s) => s.day);

  const [weekday, setWeekday] = useState<number>(viewDay.getDay());
  const day = schedule[weekday] ?? { exerciseIds: [] };

  return (
    <Screen footer={<Button label={t('common.done')} onPress={() => router.back()} />}>
      <View style={styles.header}>
        <Ionicons name="calendar" size={22} color={theme.text} />
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('schedule.title')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: Spacing.sm }}>
        {t('schedule.subtitle')}
      </Text>

      {/* Weekday selector */}
      <View style={styles.weekRow}>
        {Array.from({ length: 7 }, (_, i) => {
          const active = weekday === i;
          const has = (schedule[i]?.exerciseIds.length ?? 0) > 0;
          return (
            <Pressable
              key={i}
              onPress={() => setWeekday(i)}
              style={[
                styles.weekChip,
                { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>
                {weekdayLabel(i, locale, 'short')}
              </Text>
              {has && <View style={[styles.hasDot, { backgroundColor: active ? theme.onPrimary : theme.primary }]} />}
            </Pressable>
          );
        })}
      </View>

      {/* Day title */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6, marginTop: Spacing.sm }]}>
        {t('schedule.dayName')}
      </Text>
      <View style={[styles.inputWrap, { backgroundColor: theme.card, borderColor: theme.border }, cardShadow(theme.shadow)]}>
        <TextInput
          value={day.title ?? ''}
          onChangeText={(txt) => setScheduleTitle(weekday, txt)}
          placeholder={t('schedule.dayNamePlaceholder', { weekday: weekdayLabel(weekday, locale, 'long') })}
          placeholderTextColor={theme.textTertiary}
          maxLength={40}
          style={{ flex: 1, color: theme.text, fontSize: 16, padding: 0 }}
        />
      </View>

      {/* Exercises for this weekday */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {t('schedule.exercisesFor', { weekday: weekdayLabel(weekday, locale, 'long') })}
      </Text>
      {day.exerciseIds.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="barbell-outline" size={28} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('schedule.emptyDay')}</Text>
        </View>
      ) : (
        <View style={[styles.listCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          {day.exerciseIds.map((exId, i) => {
            const ex = findExercise(exId, custom);
            return (
              <View
                key={exId}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: theme.cardSubtle }]}>
                  <Ionicons name="barbell" size={15} color={theme.primary} />
                </View>
                <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {ex ? exerciseName(ex, lang) : exId}
                </Text>
                <Pressable onPress={() => removeFromSchedule(weekday, exId)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Button
        label={t('schedule.addExercise')}
        icon="add"
        variant="secondary"
        onPress={() => router.push(`/exercise-library?pick=schedule&weekday=${weekday}`)}
        style={{ marginTop: Spacing.sm }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  weekRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  weekChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 10,
    gap: 4,
  },
  hasDot: { width: 5, height: 5, borderRadius: 2.5 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm },
  listCard: { borderRadius: Radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
