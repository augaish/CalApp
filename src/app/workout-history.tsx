import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { EmptyState } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { exerciseIcon, exerciseName, findExercise, MUSCLE_COLORS } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import { dayBurnAllocation, isSameDay, useAppStore, whoopCalibrationFactor, whoopKcalForWorkout, workoutDays } from '@/lib/store';
import { useViewDay } from '@/lib/day';
import type { LoggedWorkout } from '@/lib/types';

import { summarize } from './(tabs)/training';

/**
 * S21 Workout history — every day trained, newest first, with the actual
 * sets and the energy attributed to each. Highest load (Best) and a
 * session's own top set are different facts and are labelled apart.
 */
export default function WorkoutHistory() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  const workouts = useAppStore((s) => s.workouts);
  const custom = useAppStore((s) => s.exercises);
  const whoopBurnByDay = useAppStore((s) => s.whoopBurnByDay);
  const whoopWorkoutsByDay = useAppStore((s) => s.whoopWorkoutsByDay);
  const removeWorkout = useAppStore((s) => s.removeWorkout);
  const copyDayTo = useAppStore((s) => s.copyDayTo);
  const selected = useViewDay((s) => s.day);

  const groups = workoutDays(workouts, selected);
  const calibration = whoopCalibrationFactor(workouts, whoopWorkoutsByDay);
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => (groups[0] ? { [groups[0].key]: true } : {}));
  const kg = t('progress.kg');
  const selectedIsToday = isSameDay(new Date().toISOString(), selected);

  const nameOf = (w: LoggedWorkout): string => {
    const ex = findExercise(w.exerciseId, custom);
    return ex ? exerciseName(ex, lang) : w.exerciseName;
  };

  const confirmDeleteWorkout = (id: string) =>
    Alert.alert(t('training.deleteWorkoutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeWorkout(id) },
    ]);

  // Re-run a past day on the day being viewed — copied as targets, not as
  // work already done, so nothing counts as burned until it is ticked off.
  const copyDay = (from: Date) => {
    const label = from.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' });
    const to = selectedIsToday ? t('home.today') : selected.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
    Alert.alert(t('training.copyDayTitle'), t('training.copyDayBody', { from: label, to }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.copyDayCta'),
        onPress: () => {
          const n = copyDayTo(from, selected);
          if (n === 0) return Alert.alert(t('training.copyNothing'));
          successHaptic();
          Alert.alert(t('training.repeated', { count: n }));
        },
      },
    ]);
  };

  return (
    <Screen header={<PageHeader title={t('training.workoutHistory')} />}>
      {groups.length === 0 ? (
        <EmptyState icon="barbell-outline" title={t('training.nothingLogged')} body={t('progress.noWorkouts')} action={{ label: t('training.addExercise'), icon: 'add', onPress: () => router.push('/exercise-library') }} />
      ) : (
        groups.map((g) => {
          const dayAllocation = dayBurnAllocation(workouts, g.date, whoopBurnByDay, whoopWorkoutsByDay, calibration);
          const dayBurn = g.items.reduce((s, w) => s + (dayAllocation.get(w.id) ?? 0), 0);
          const open = !!openDays[g.key];
          return (
            <View key={g.key} style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
              <Pressable onPress={() => setOpenDays((o) => ({ ...o, [g.key]: !o[g.key] }))} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{g.date.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                    {t('training.exerciseCount', { count: g.items.length })} · {dayBurn} {t('common.kcal')}
                  </Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
              </Pressable>
              {open &&
                g.items.map((w) => {
                  const ex = findExercise(w.exerciseId, custom);
                  const accent = ex ? MUSCLE_COLORS[ex.category] : theme.primary;
                  const wCalories = dayAllocation.get(w.id) ?? 0;
                  const wFromWhoop = whoopKcalForWorkout(w, g.items, whoopWorkoutsByDay[g.key] ?? []) != null;
                  return (
                    <View key={w.id} style={[styles.workoutRow, { borderTopColor: theme.border }]}>
                      <Pressable onPress={() => router.push(`/exercise-detail?id=${encodeURIComponent(w.exerciseId)}&tab=history`)} accessibilityRole="button" style={({ pressed }) => [styles.workoutTap, pressed && { opacity: 0.6 }]}>
                        <View style={[styles.workoutIcon, { backgroundColor: accent + '22' }]}>
                          <Ionicons name={ex ? exerciseIcon(ex) : 'barbell-outline'} size={16} color={accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                            {nameOf(w)}
                          </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{summarize(w, t('training.sets'), t('training.top'), kg)}</Text>
                        </View>
                        {!!wCalories && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {wFromWhoop && <Ionicons name="watch-outline" size={11} color={theme.carbs} />}
                            <Text style={{ color: theme.carbs, fontWeight: '700', fontSize: 12 }}>
                              {wCalories} {t('common.kcal')}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                      <Pressable onPress={() => confirmDeleteWorkout(w.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.delete')} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
                      </Pressable>
                    </View>
                  );
                })}
              {open && (
                <Pressable onPress={() => copyDay(g.date)} accessibilityRole="button" style={({ pressed }) => [styles.copyDayBtn, { backgroundColor: theme.surfaceTint }, pressed && { opacity: 0.6 }]}>
                  <Ionicons name="copy-outline" size={16} color={theme.primary} />
                  <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 14 }}>
                    {selectedIsToday ? t('training.duplicateToToday') : t('training.duplicateTo', { day: selected.toLocaleDateString(lang, { day: 'numeric', month: 'short' }) })}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  workoutTap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  workoutIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  copyDayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm, minHeight: 44, borderRadius: Radius.control },
});
