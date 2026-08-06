import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { useViewDay } from '@/lib/day';
import { exerciseIcon, exerciseName, findExercise, MUSCLE_COLORS } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import {
  bestSetIndex,
  burnedForDay,
  dateKey,
  historyFor,
  isSameDay,
  setScore,
  useAppStore,
  workoutFor,
} from '@/lib/store';
import type { ExerciseType, LoggedWorkout, WorkoutSet } from '@/lib/types';

/** Whole minutes, for cardio durations stored as seconds. */
function toMin(seconds: number | undefined): number {
  return Math.round((seconds ?? 0) / 60);
}

/**
 * One set as it reads on the day's card: the number you are about to lift.
 * Weight first because that is what you set on the machine.
 */
function setChipLabel(s: WorkoutSet, type: ExerciseType, kg: string, min: string): string {
  if (type === 'weight_reps') {
    return s.weightKg ? `${s.weightKg}${kg} × ${s.reps ?? 0}` : `× ${s.reps ?? 0}`;
  }
  if (type === 'bodyweight_reps') return `× ${s.reps ?? 0}`;
  if (type === 'time') return `${s.seconds ?? 0}s`;
  const parts = [`${toMin(s.seconds)} ${min}`];
  if (s.distanceM) parts.push(`${(s.distanceM / 1000).toFixed(1)} km`);
  return parts.join(' · ');
}

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
  return `${((best.distanceM ?? 0) / 1000).toFixed(1)} km`;
}

/** Numeric "best set" score of a session, for picking the highest prior. */
function sessionTopScore(w: LoggedWorkout): number {
  return Math.max(
    0,
    ...w.sets.map((s) =>
      w.type === 'weight_reps'
        ? (s.weightKg ?? 0) * 1000 + (s.reps ?? 0)
        : w.type === 'bodyweight_reps'
          ? (s.reps ?? 0)
          : w.type === 'time'
            ? (s.seconds ?? 0)
            : (s.distanceM ?? 0),
    ),
  );
}

/**
 * Group workouts into date buckets, newest first. The day being viewed is left
 * out: it is already laid out in full above, so repeating it here would just be
 * the same sets twice.
 */
function groupByDay(
  workouts: LoggedWorkout[],
  exclude: Date,
): { key: string; date: Date; items: LoggedWorkout[] }[] {
  const groups: { key: string; date: Date; items: LoggedWorkout[] }[] = [];
  for (const w of workouts) {
    if (isSameDay(w.at, exclude)) continue;
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
  const copyDayTo = useAppStore((s) => s.copyDayTo);
  const markExerciseDone = useAppStore((s) => s.markExerciseDone);
  const removeWorkout = useAppStore((s) => s.removeWorkout);
  const setWorkoutTrained = useAppStore((s) => s.setWorkoutTrained);
  const skips = useAppStore((s) => s.skips);
  const skipPlanToday = useAppStore((s) => s.skipPlanToday);
  const restorePlanToday = useAppStore((s) => s.restorePlanToday);
  const selected = useViewDay((s) => s.day);
  const shift = useViewDay((s) => s.shift);

  const plan = schedule[selected.getDay()];
  const skippedIds = skips[dateKey(selected)] ?? [];
  const scheduledIds = plan ? plan.exerciseIds.filter((id) => !skippedIds.includes(id)) : [];
  const skippedPlanIds = plan ? plan.exerciseIds.filter((id) => skippedIds.includes(id)) : [];

  // Anything logged on this day that the weekly schedule does not know about —
  // duplicated from another day, scanned in, or picked from the library. The
  // card has to show what was actually done, not only what was planned, or
  // those exercises exist in the data with nowhere to appear.
  const unplannedIds = [
    ...new Set(
      workouts.filter((w) => isSameDay(w.at, selected)).map((w) => w.exerciseId),
    ),
  ].filter((id) => !scheduledIds.includes(id));
  const visiblePlanIds = [...scheduledIds, ...unplannedIds];

  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const burned = burnedForDay(workouts, selected);
  const groups = groupByDay(workouts, selected);
  const kg = t('progress.kg');
  const min = t('track.min');

  // Past days start collapsed — history is for looking something up, not for
  // scrolling past on the way to today.
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const toggleDay = (key: string) => setOpenDays((o) => ({ ...o, [key]: !o[key] }));

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

  // Re-run a past day on the day being viewed. Copied as targets, not as work
  // already done, so nothing counts as burned until it is ticked off.
  const copyDay = (from: Date) => {
    const label = from.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
    const to = selectedIsToday
      ? t('home.today')
      : selected.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    Alert.alert(t('training.copyDayTitle'), t('training.copyDayBody', { from: label, to }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.copyDayCta'),
        onPress: () => {
          const n = copyDayTo(from, selected);
          if (n === 0) {
            Alert.alert(t('training.copyNothing'));
            return;
          }
          successHaptic();
          Alert.alert(t('training.repeated', { count: n }));
        },
      },
    ]);
  };

  // Done/undone toggle for the checkbox — never navigates and never loses your
  // numbers. First check logs the session (seeded from your best prior record).
  // Unchecking KEEPS the same record but marks it not-trained (no calories);
  // re-checking marks it trained again. Reps are edited via the name/arrow.
  const checkOff = (exId: string) => {
    const existing = workoutFor(workouts, exId, selected);
    if (existing) {
      const trained = existing.sets.some((s) => s.done);
      setWorkoutTrained(existing.id, !trained);
      if (!trained) {
        successHaptic();
        useCelebrate.getState().celebrate(t('celebrate.workoutDone'));
      }
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

      {/* The day itself: the weekly plan plus anything else logged today. */}
      {visiblePlanIds.length > 0 ? (
        <Card>
          <View style={styles.routineHead}>
            <Ionicons name="calendar" size={18} color={theme.primary} />
            <Text style={[styles.cardTitle, { color: theme.text, flex: 1, marginBottom: 0 }]}>
              {plan?.title || t('training.todaysPlan')}
            </Text>
            {/* Labelled rather than a bare pencil: the weekly schedule is now
                the only place plans come from, so how to reach it has to be
                obvious. */}
            <Pressable
              onPress={() => router.push('/schedule')}
              hitSlop={8}
              style={({ pressed }) => [
                styles.editPlanBtn,
                { backgroundColor: theme.cardSubtle },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="create-outline" size={15} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>
                {t('training.editPlan')}
              </Text>
            </Pressable>
          </View>
          <View style={{ marginTop: Spacing.sm }}>
            {visiblePlanIds.map((exId) => {
              const ex = findExercise(exId, custom);
              const wToday = workoutFor(workouts, exId, selected);
              const doneToday = !!wToday && wToday.sets.some((s) => s.done);
              const planned = plan?.plans?.[exId] ?? [];
              const type = ex?.type ?? 'weight_reps';
              const accent = ex ? MUSCLE_COLORS[ex.category] : theme.primary;
              // Every set for this day, right on the card — what is already
              // logged if you have started, otherwise the plan's targets. No
              // tapping through to find out what you are meant to lift.
              // Sorted lightest to heaviest so the strip reads the same way
              // whether the sets were logged warming up or dropping down, and
              // the day's best lands at the end. This is a display copy only:
              // Exercise Detail keeps the real logged order, because its rows
              // are numbered and edited by index.
              const rows: WorkoutSet[] = (
                wToday?.sets.length ? [...wToday.sets] : planned.map((p) => ({ ...p, done: false }))
              ).sort((a, b) => setScore(a, type) - setScore(b, type));
              // Your highest-ever session, kept as the reference to beat.
              const best = historyFor(workouts, exId).reduce<LoggedWorkout | undefined>(
                (b, w) => (!b || sessionTopScore(w) > sessionTopScore(b) ? w : b),
                undefined,
              );
              const maxLabel = best ? bestSetLabel(best, best.type, kg) : '';
              return (
                <View key={exId} style={styles.planItem}>
                  <View style={styles.planRow}>
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
                      <View style={[styles.rowIcon, { backgroundColor: accent + '22' }]}>
                        <Ionicons
                          name={ex ? exerciseIcon(ex) : 'barbell-outline'}
                          size={15}
                          color={accent}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                          {ex ? exerciseName(ex, lang) : exId}
                        </Text>
                        {maxLabel ? (
                          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                            {t('training.max')}: {maxLabel}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        // Skipping hides a scheduled exercise for today only.
                        // One that was never scheduled has nothing to skip, so
                        // the × removes what was logged instead.
                        scheduledIds.includes(exId)
                          ? skipPlanToday(selected, exId)
                          : wToday && confirmDeleteWorkout(wToday.id)
                      }
                      hitSlop={8}
                      style={styles.skipBtn}
                    >
                      <Ionicons name="close" size={18} color={theme.textTertiary} />
                    </Pressable>
                  </View>
                  {rows.length > 0 && (
                    <View style={styles.setStrip}>
                      {rows.map((s, i) => {
                        // Only the day's best set carries the accent. Colouring
                        // every logged set just repeated what the checkmark
                        // already says; this way the colour points at the one
                        // number worth beating — the same set the trophy marks
                        // inside the exercise.
                        const top = s.done && i === bestSetIndex(rows, type);
                        return (
                          <View
                            key={i}
                            style={[
                              styles.setChip,
                              top
                                ? { backgroundColor: accent + '22', borderColor: accent + '55' }
                                : { backgroundColor: theme.cardSubtle, borderColor: theme.border },
                            ]}
                          >
                            <Text
                              style={{
                                color: top ? accent : theme.textSecondary,
                                fontSize: 12,
                                fontWeight: top ? '800' : '700',
                              }}
                            >
                              {setChipLabel(s, type, kg, min)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          {skippedPlanIds.length > 0 && (
            <View style={[styles.skippedWrap, { borderTopColor: theme.border }]}>
              <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 6 }}>
                {t('training.skippedToday')}
              </Text>
              <View style={styles.chipWrap}>
                {skippedPlanIds.map((exId) => {
                  const ex = findExercise(exId, custom);
                  return (
                    <Pressable
                      key={exId}
                      onPress={() => restorePlanToday(selected, exId)}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: theme.cardSubtle },
                        pressed && { transform: [{ scale: 0.95 }] },
                      ]}
                    >
                      <Ionicons name="arrow-undo" size={13} color={theme.primary} />
                      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                        {ex ? exerciseName(ex, lang) : exId}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
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
          const open = !!openDays[g.key];
          return (
            <Card key={g.key}>
              <Pressable
                onPress={() => toggleDay(g.key)}
                style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.6 }]}
              >
                <Ionicons
                  name={open ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={theme.textSecondary}
                />
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, flex: 1 }}>
                  {g.date.toLocaleDateString(locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {t('training.exerciseCount', { count: g.items.length })}
                </Text>
                <Text style={{ color: theme.carbs, fontWeight: '700', fontSize: 13 }}>
                  {dayBurn} {t('common.kcal')}
                </Text>
              </Pressable>
              {open &&
                g.items.map((w) => {
                  const ex = findExercise(w.exerciseId, custom);
                  const accent = ex ? MUSCLE_COLORS[ex.category] : theme.primary;
                  return (
                    <View key={w.id} style={styles.workoutRow}>
                      <Pressable
                        onPress={() => openExercise(w.exerciseId)}
                        style={({ pressed }) => [styles.workoutTap, pressed && { opacity: 0.6 }]}
                      >
                        <View style={[styles.workoutIcon, { backgroundColor: accent + '22' }]}>
                          <Ionicons
                            name={ex ? exerciseIcon(ex) : 'barbell-outline'}
                            size={16}
                            color={accent}
                          />
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
                  );
                })}
              {open && (
                <Pressable
                  onPress={() => copyDay(g.date)}
                  style={({ pressed }) => [
                    styles.copyDayBtn,
                    { borderColor: theme.primary },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Ionicons name="copy-outline" size={16} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>
                    {selectedIsToday
                      ? t('training.duplicateToToday')
                      : t('training.duplicateTo', {
                          day: selected.toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                          }),
                        })}
                  </Text>
                </Pressable>
              )}
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
  editPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.full,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  planItem: { paddingVertical: 4 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  planTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  // Indented to sit under the exercise name, clear of the checkbox column.
  setStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginStart: 34 + Spacing.sm,
    marginBottom: 4,
  },
  setChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipBtn: { padding: 4 },
  skippedWrap: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
    gap: Spacing.sm,
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
  copyDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 11,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  workoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
});
