import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { useViewDay } from '@/lib/day';
import { exerciseName, findExercise } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import { burnedForDay, historyFor, isSameDay, useAppStore, workoutFor } from '@/lib/store';
import type { Exercise, ExerciseType, LoggedWorkout, WorkoutSet } from '@/lib/types';

/** Short label of the best (heaviest) set in a session, for the plan preview. */
function bestSetLabel(w: LoggedWorkout, type: ExerciseType, kg: string): string {
  const best = w.sets.reduce<WorkoutSet | undefined>((b, s) => {
    if (!b) return s;
    if (type === 'weight_reps') return (s.weightKg ?? 0) >= (b.weightKg ?? 0) ? s : b;
    if (type === 'bodyweight_reps') return (s.reps ?? 0) >= (b.reps ?? 0) ? s : b;
    if (type === 'time') return (s.seconds ?? 0) >= (b.seconds ?? 0) ? s : b;
    return (s.distanceM ?? 0) >= (b.distanceM ?? 0) ? s : b;
  }, undefined);
  if (!best) return '';
  if (type === 'weight_reps') return `${best.weightKg ?? 0} ${kg} × ${best.reps ?? 0}`;
  if (type === 'bodyweight_reps') return `× ${best.reps ?? 0}`;
  if (type === 'time') return `${best.seconds ?? 0}s`;
  return `${best.distanceM ?? 0} m`;
}

/** Exercises most frequently trained on the same weekday as `day`. */
function routineFor(workouts: LoggedWorkout[], day: Date): { id: string; name: string }[] {
  const weekday = day.getDay();
  const counts = new Map<string, { name: string; n: number }>();
  for (const w of workouts) {
    if (new Date(w.at).getDay() !== weekday) continue;
    const cur = counts.get(w.exerciseId);
    counts.set(w.exerciseId, { name: w.exerciseName, n: (cur?.n ?? 0) + 1 });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 4)
    .map(([id, v]) => ({ id, name: v.name }));
}

/** Group workouts into date buckets, newest first. */
function groupByDay(workouts: LoggedWorkout[]): { key: string; date: Date; items: LoggedWorkout[] }[] {
  const groups: { key: string; date: Date; items: LoggedWorkout[] }[] = [];
  for (const w of workouts) {
    const d = new Date(w.at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, date: d, items: [] };
      groups.push(g);
    }
    g.items.push(w);
  }
  return groups;
}

/** Short one-line summary of a logged exercise: sets · top load. */
function summarize(w: LoggedWorkout, sets: string, top: string, kg: string): string {
  const parts = [`${w.sets.length} ${sets}`];
  if (w.type === 'weight_reps') {
    const best = Math.max(0, ...w.sets.map((s) => s.weightKg ?? 0));
    if (best > 0) parts.push(`${top} ${best} ${kg}`);
  } else if (w.type === 'bodyweight_reps') {
    const best = Math.max(0, ...w.sets.map((s) => s.reps ?? 0));
    if (best > 0) parts.push(`${top} ${best}`);
  }
  return parts.join(' · ');
}

export default function Training() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const locale = lang;

  const workouts = useAppStore((s) => s.workouts);
  const custom = useAppStore((s) => s.exercises);
  const schedule = useAppStore((s) => s.schedule);
  const repeatLastSession = useAppStore((s) => s.repeatLastSession);
  const markExerciseDone = useAppStore((s) => s.markExerciseDone);
  const removeWorkout = useAppStore((s) => s.removeWorkout);
  const selected = useViewDay((s) => s.day);
  const shift = useViewDay((s) => s.shift);

  const plan = schedule[selected.getDay()];

  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const burned = burnedForDay(workouts, selected);
  const routine = routineFor(workouts, selected);
  const groups = groupByDay(workouts);
  const weekday = selected.toLocaleDateString(locale, { weekday: 'long' });
  const kg = t('progress.kg');

  // Resolve a logged exercise's display name live (localized) when it still
  // exists in the library; fall back to the snapshot taken at log time.
  const nameOf = (w: LoggedWorkout): string => {
    const ex = findExercise(w.exerciseId, custom);
    return ex ? exerciseName(ex, lang) : w.exerciseName;
  };

  const openExercise = (id: string) => router.push(`/exercise-detail?id=${encodeURIComponent(id)}`);

  const confirmDeleteWorkout = (id: string) =>
    Alert.alert(t('training.deleteWorkoutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeWorkout(id) },
    ]);

  const repeat = () => {
    const n = repeatLastSession(selected);
    if (n === 0) {
      Alert.alert(t('training.noPrevious'));
      return;
    }
    successHaptic();
    Alert.alert(t('training.repeated', { count: n }));
  };

  // Pure done/undone toggle for the checkbox — never navigates. Checking marks
  // it done (cloning the last session's sets, or an empty "done" set when
  // there's no history); unchecking removes that day's entry. Reps are filled
  // by tapping the name/arrow, which opens the exercise.
  const checkOff = (exId: string) => {
    const existing = workoutFor(workouts, exId, selected);
    if (existing) {
      removeWorkout(existing.id);
      return;
    }
    const ex = findExercise(exId, custom);
    markExerciseDone(
      { id: exId, name: ex ? exerciseName(ex, lang) : exId, type: ex?.type ?? 'weight_reps' },
      selected,
    );
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.workoutDone'));
  };

  return (
    <Screen
      footer={
        <View style={styles.footerRow}>
          <Button
            label={t('training.addExercise')}
            icon="add"
            onPress={() => router.push('/exercise-library')}
            style={{ flex: 1 }}
          />
          <Button
            label={t('training.scanCta')}
            icon="barbell"
            variant="secondary"
            onPress={() => router.push('/scan?mode=gym')}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <View style={styles.headerRow}>
        <Ionicons name="barbell" size={22} color={theme.text} />
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('tabs.training')}</Text>
        <View style={styles.dayNavGroup}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.arrow}>
            <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={() => router.push('/calendar')} hitSlop={6}>
            <Text style={[styles.dayLabel, { color: theme.text }]}>
              {selectedIsToday
                ? t('home.today')
                : selected.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </Text>
          </Pressable>
          <Pressable onPress={() => shift(1)} hitSlop={10} disabled={selectedIsToday} style={styles.arrow}>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={selectedIsToday ? theme.border : theme.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <Card style={styles.burnCard}>
        <View style={[styles.burnIcon, { backgroundColor: 'rgba(245,166,35,0.15)' }]}>
          <Ionicons name="flame" size={26} color={theme.carbs} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.burnValue, { color: theme.text }]}>
            {burned} <Text style={styles.burnUnit}>{t('common.kcal')}</Text>
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {t('training.burned')} · {t('training.estimated')}
          </Text>
        </View>
      </Card>

      {/* Today's plan (from the weekly schedule) */}
      {plan && plan.exerciseIds.length > 0 ? (
        <Card>
          <View style={styles.routineHead}>
            <Ionicons name="calendar" size={18} color={theme.primary} />
            <Text style={[styles.cardTitle, { color: theme.text, flex: 1, marginBottom: 0 }]}>
              {plan.title || t('training.todaysPlan')}
            </Text>
            <Pressable onPress={() => router.push('/schedule')} hitSlop={8}>
              <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
          <View style={{ marginTop: Spacing.sm }}>
            {plan.exerciseIds.map((exId) => {
              const ex = findExercise(exId, custom);
              const doneToday = !!workoutFor(workouts, exId, selected);
              const planned = plan.plans?.[exId] ?? [];
              const last = historyFor(workouts, exId).find((w) => !isSameDay(w.at, selected));
              const preview = last ? bestSetLabel(last, last.type, kg) : '';
              return (
                <View key={exId} style={styles.planRow}>
                  <Pressable onPress={() => checkOff(exId)} hitSlop={8}>
                    <View
                      style={[
                        styles.checkBox,
                        doneToday
                          ? { backgroundColor: theme.primary, borderColor: theme.primary }
                          : { borderColor: theme.border },
                      ]}
                    >
                      {doneToday && <Ionicons name="checkmark" size={15} color={theme.onPrimary} />}
                    </View>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.planTap, pressed && { opacity: 0.6 }]}
                    onPress={() => openExercise(exId)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                        {ex ? exerciseName(ex, lang) : exId}
                      </Text>
                      {planned.length > 0 ? (
                        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>
                          {t('training.planTarget', {
                            count: planned.length,
                            detail: bestSetLabel(
                              { sets: planned.map((p) => ({ ...p, done: false })) } as LoggedWorkout,
                              ex?.type ?? 'weight_reps',
                              kg,
                            ),
                          })}
                        </Text>
                      ) : preview ? (
                        <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                          {t('training.last')}: {preview}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>
      ) : (
        <Pressable onPress={() => router.push('/schedule')}>
          <Card>
            <View style={styles.buildScheduleRow}>
              <Ionicons name="calendar-outline" size={20} color={theme.primary} />
              <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>
                {t('training.buildSchedule')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </View>
          </Card>
        </Pressable>
      )}

      {/* Routine insight + repeat last session */}
      <Card>
        <View style={styles.routineHead}>
          <Text style={[styles.cardTitle, { color: theme.text, flex: 1 }]}>{t('training.routine')}</Text>
          <Pressable onPress={repeat} hitSlop={8} style={styles.repeatBtn}>
            <Ionicons name="repeat" size={16} color={theme.primary} />
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>
              {t('training.repeatLast')}
            </Text>
          </Pressable>
        </View>
        {routine.length > 0 ? (
          <>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: Spacing.sm }}>
              {t('training.routineHint', { weekday })}
            </Text>
            <View style={styles.chipWrap}>
              {routine.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => openExercise(r.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: theme.cardSubtle },
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <Ionicons name="add" size={14} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>
                    {(() => {
                      const ex: Exercise | undefined = findExercise(r.id, custom);
                      return ex ? exerciseName(ex, lang) : r.name;
                    })()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={{ color: theme.textSecondary }}>{t('training.noRoutine')}</Text>
        )}
      </Card>

      {/* History grouped by day */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('training.history')}</Text>
      {groups.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="barbell-outline" size={36} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            {t('progress.noWorkouts')}
          </Text>
        </View>
      ) : (
        groups.map((g) => {
          const dayBurn = g.items.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);
          return (
            <Card key={g.key}>
              <View style={styles.groupHead}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, flex: 1 }}>
                  {isSameDay(g.date.toISOString(), new Date())
                    ? t('home.today')
                    : g.date.toLocaleDateString(locale, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                      })}
                </Text>
                <Text style={{ color: theme.carbs, fontWeight: '700', fontSize: 13 }}>
                  {dayBurn} {t('common.kcal')}
                </Text>
              </View>
              {g.items.map((w) => (
                <View key={w.id} style={styles.workoutRow}>
                  <Pressable
                    onPress={() => openExercise(w.exerciseId)}
                    style={({ pressed }) => [styles.workoutTap, pressed && { opacity: 0.6 }]}
                  >
                    <View style={[styles.workoutIcon, { backgroundColor: theme.cardSubtle }]}>
                      <Ionicons name="barbell" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                        {nameOf(w)}
                      </Text>
                      <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                        {summarize(w, t('training.sets'), t('training.top'), kg)}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteWorkout(w.id)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dayNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    // Fixed LTR order: prevents RN's RTL row-mirroring from pointing the
    // static chevron glyphs the wrong way. See Overview headerCenter.
    direction: 'ltr',
  },
  arrow: { padding: 4 },
  dayLabel: { fontSize: 15, fontWeight: '700', minWidth: 60, textAlign: 'center' },
  burnCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  burnIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnValue: { fontSize: 26, fontWeight: '800' },
  burnUnit: { fontSize: 14, fontWeight: '600' },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm },
  routineHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  repeatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
  planTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildScheduleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.xs },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
  },
  workoutTap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  deleteBtn: { padding: 4 },
  workoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
});
