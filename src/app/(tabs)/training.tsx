import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Button, Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchWhoopDayBurn, fetchWhoopHistory } from '@/lib/api';
import { useCelebrate } from '@/lib/celebrate';
import { useViewDay } from '@/lib/day';
import { exerciseIcon, exerciseName, findExercise, MUSCLE_COLORS } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import {
  actualBurnedForDay,
  actualBurnedForWorkout,
  applyOrder,
  bestSetIndex,
  dateKey,
  historyFor,
  isSameDay,
  setScore,
  useAppStore,
  whoopCalibrationFactor,
  whoopKcalForWorkout,
  workoutDays,
  workoutFor,
} from '@/lib/store';
import type { ExerciseType, LoggedWorkout, WorkoutSet } from '@/lib/types';

/** How many trailing days (including today) get a live WHOOP refetch on
 * every Training tab focus, to catch up on WHOOP's own scoring lag without
 * waiting on the slower 60-day backfill's daily retry. */
const RECENT_WHOOP_DAYS = 3;

/** Weekday name in the active locale (Jan 7 2024 was a Sunday). */
function weekdayLabel(i: number, locale: string): string {
  return new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'long' });
}

/** Whole minutes, for cardio durations stored as seconds. */
function toMin(seconds: number | undefined): number {
  return Math.round((seconds ?? 0) / 60);
}

/** WHOOP's sport names are lowercase/underscored ("functional_fitness") — just clean them up for display. */
function formatSportName(sportName: string): string {
  const spaced = sportName.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** How long ago the WHOOP burn card's numbers were actually fetched — so a
 * stale-looking number (WHOOP still scoring, or just no new fetch since you
 * last opened this tab) reads as stale instead of silently wrong. */
function syncedAgoLabel(iso: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t('training.syncedJustNow');
  if (minutes < 60) return t('training.syncedMinutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('training.syncedHoursAgo', { count: hours });
  return t('training.syncedDaysAgo', { count: Math.floor(hours / 24) });
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
  const whoopBurnByDay = useAppStore((s) => s.whoopBurnByDay);
  const setWhoopDayBurn = useAppStore((s) => s.setWhoopDayBurn);
  const whoopWorkoutsByDay = useAppStore((s) => s.whoopWorkoutsByDay);
  const setWhoopDayWorkouts = useAppStore((s) => s.setWhoopDayWorkouts);
  const whoopBackfilledAt = useAppStore((s) => s.whoopBackfilledAt);
  const setWhoopBackfilledAt = useAppStore((s) => s.setWhoopBackfilledAt);
  const whoopLastFetchedAt = useAppStore((s) => s.whoopLastFetchedAt);
  const setWhoopLastFetchedAt = useAppStore((s) => s.setWhoopLastFetchedAt);
  const custom = useAppStore((s) => s.exercises);
  const schedule = useAppStore((s) => s.schedule);
  const copyDayTo = useAppStore((s) => s.copyDayTo);
  const dayOrder = useAppStore((s) => s.dayOrder);
  const setDayOrder = useAppStore((s) => s.setDayOrder);
  const saveDayToSchedule = useAppStore((s) => s.saveDayToSchedule);
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
  const selectedDayWorkouts = workouts.filter((w) => isSameDay(w.at, selected));
  const loggedTodayCount = selectedDayWorkouts.length;
  const unplannedIds = [
    ...new Set(
      workouts.filter((w) => isSameDay(w.at, selected)).map((w) => w.exerciseId),
    ),
  ].filter((id) => !scheduledIds.includes(id));
  const visiblePlanIds = applyOrder(
    [...scheduledIds, ...unplannedIds],
    dayOrder[dateKey(selected)],
  );

  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const burned = actualBurnedForDay(workouts, whoopBurnByDay, selected);
  const whoopDayTotal = whoopBurnByDay[dateKey(selected)] ?? null;
  const whoopWorkouts = whoopWorkoutsByDay[dateKey(selected)] ?? [];
  // The same factor `actualBurnedForDay` used above for the day total, fed
  // into every per-exercise formula fallback below too — otherwise the day
  // card shows a WHOOP-calibrated number while the rows under it silently
  // fall back to the uncalibrated formula, and the two can never add up.
  const calibration = whoopCalibrationFactor(workouts, whoopBurnByDay);
  const whoopCalibrated = whoopDayTotal == null && calibration !== 1;
  const groups = workoutDays(workouts, selected);
  const kg = t('progress.kg');
  const min = t('track.min');

  // Diagnostic state from the last day-burn fetch — not persisted, since
  // it's only meaningful for right-now's "today" check, not history: lets
  // the subtitle actually say why there's no WHOOP number yet (never
  // connected / token expired vs. WHOOP recorded something but hasn't
  // scored it vs. genuinely nothing today) instead of one vague fallback
  // label covering all three.
  const [whoopConnected, setWhoopConnected] = useState<boolean | null>(null);
  const [whoopPending, setWhoopPending] = useState(false);

  // Pull WHOOP's real numbers for the last few days whenever this screen
  // gains focus — not just "today", and not gated by which day is currently
  // selected. This is about catching up on WHOOP's own scoring lag (a
  // workout can take a while after it ends before WHOOP finishes scoring
  // it), which has nothing to do with what's on screen right now: a workout
  // logged yesterday that was still unscored when the one-time 60-day
  // backfill (below) first ran would otherwise stay stuck on the formula
  // estimate for up to 24h — the backfill's own retry cadence — since it
  // only re-runs that seldom. Refreshing the last few days on every focus
  // closes that gap without waiting on the backfill's slower schedule.
  const refreshWhoopRecent = useCallback(() => {
    let alive = true;
    for (let i = 0; i < RECENT_WHOOP_DAYS; i++) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      fetchWhoopDayBurn(start.toISOString(), end.toISOString()).then(
        ({ totalKcal, workouts: w, connected, pending }) => {
          if (!alive) return;
          setWhoopDayBurn(day, totalKcal);
          setWhoopDayWorkouts(day, w);
          if (i === 0) {
            setWhoopLastFetchedAt(new Date().toISOString());
            setWhoopConnected(connected ?? null);
            setWhoopPending(!!pending);
          }
        },
      );
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedTodayCount]);

  useFocusEffect(refreshWhoopRecent);

  // One-time (then daily-refreshed) backfill: someone connecting WHOOP after
  // months of using it shouldn't start the burn calibration from nothing.
  // Only a run that actually finds workouts marks it done — "not connected
  // yet" costs the server a single fast lookup, so it's fine to keep retrying
  // that for free until a connection actually exists.
  useEffect(() => {
    const last = whoopBackfilledAt ? new Date(whoopBackfilledAt).getTime() : 0;
    if (Date.now() - last < 24 * 3600_000) return;
    let alive = true;
    fetchWhoopHistory(60).then((entries) => {
      if (!alive || entries.length === 0) return;
      const byDay = new Map<string, typeof entries>();
      for (const entry of entries) {
        const list = byDay.get(entry.localDate) ?? [];
        list.push(entry);
        byDay.set(entry.localDate, list);
      }
      for (const [localDate, dayEntries] of byDay) {
        const [y, m, d] = localDate.split('-').map(Number);
        const day = new Date(y, m - 1, d);
        setWhoopDayBurn(day, dayEntries.reduce((sum, e) => sum + e.kcal, 0));
        setWhoopDayWorkouts(
          day,
          dayEntries.map(({ localDate: _localDate, ...w }) => w),
        );
      }
      setWhoopBackfilledAt(new Date().toISOString());
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Past days start collapsed — history is for looking something up, not for
  // scrolling past on the way to today.
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const toggleDay = (key: string) => setOpenDays((o) => ({ ...o, [key]: !o[key] }));
  const [pickingWeekday, setPickingWeekday] = useState(false);
  // While a row is held, the set chips collapse away: nine exercises at full
  // height means dragging against constant auto-scroll, where the compact list
  // mostly fits on one screen.
  const [dragging, setDragging] = useState(false);
  const pageRef = useAnimatedRef<ScrollView>();

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

  /**
   * Turn what was trained today into a weekday of the weekly schedule. A
   * weekday that already has exercises asks first, because replacing a plan
   * and adding to it are both things people genuinely mean.
   */
  const saveToWeekday = (weekday: number) => {
    setPickingWeekday(false);
    const label = weekdayLabel(weekday, locale);
    const existing = schedule[weekday]?.exerciseIds ?? [];
    const commit = (mode: 'replace' | 'merge') => {
      const n = saveDayToSchedule(selected, weekday, mode);
      if (n === 0) return;
      successHaptic();
      Alert.alert(t('training.savedToSchedule', { count: n, day: label }));
    };
    if (existing.length === 0) {
      commit('replace');
      return;
    }
    Alert.alert(t('training.scheduleExists', { day: label }), t('training.scheduleExistsBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('training.scheduleMerge'), onPress: () => commit('merge') },
      { text: t('training.scheduleReplace'), style: 'destructive', onPress: () => commit('replace') },
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
      scrollRef={pageRef}
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

      <Card>
        <View style={styles.burnCard}>
          <View style={[styles.burnIcon, { backgroundColor: 'rgba(245,166,35,0.15)' }]}>
            <Ionicons name="flame" size={26} color={theme.carbs} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.burnValue, { color: theme.text }]}>
              {burned} <Text style={styles.burnUnit}>{t('common.kcal')}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {t('training.burned')} ·{' '}
              {whoopDayTotal != null
                ? t('training.fromWhoop')
                : selectedIsToday && whoopConnected === false
                  ? t('training.whoopNotConnected')
                  : selectedIsToday && whoopPending
                    ? t('training.whoopPending')
                    : whoopCalibrated
                      ? t('training.adjustedFromWhoop')
                      : t('training.estimated')}
            </Text>
            {selectedIsToday && whoopConnected === false && (
              <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                  {t('training.whoopReconnect')}
                </Text>
              </Pressable>
            )}
            {selectedIsToday && whoopLastFetchedAt && (
              <Pressable onPress={refreshWhoopRecent} hitSlop={8} style={styles.syncRow}>
                <Ionicons name="refresh" size={11} color={theme.textTertiary} />
                <Text style={{ color: theme.textTertiary, fontSize: 11 }}>
                  {t('training.lastSynced', { time: syncedAgoLabel(whoopLastFetchedAt, t) })}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        {whoopWorkouts.length > 0 && (
          <View style={[styles.whoopBreakdown, { borderTopColor: theme.border }]}>
            <Text style={[styles.whoopBreakdownTitle, { color: theme.textSecondary }]}>
              {t('training.whoopBreakdown')}
            </Text>
            {whoopWorkouts.map((w, i) => (
              <View key={`${w.start}-${i}`} style={styles.whoopBreakdownRow}>
                <Text style={{ color: theme.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {formatSportName(w.sportName)}
                </Text>
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {new Date(w.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '700' }}>
                  {w.kcal} {t('common.kcal')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* One fixed way into the planning model, whether or not today has a
          plan — previously this lived inside the day card and so came and went
          with it. */}
      <Pressable
        onPress={() => router.push('/schedule')}
        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
      >
        <Card style={styles.scheduleRow}>
          <View style={[styles.scheduleIcon, { backgroundColor: theme.cardSubtle }]}>
            <Ionicons name="calendar" size={19} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
              {t('training.weeklySchedule')}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {t('training.weeklyScheduleHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </Card>
      </Pressable>

      {/* The day itself: the weekly plan plus anything else logged today. */}
      {visiblePlanIds.length > 0 ? (
        <Card>
          <View style={styles.routineHead}>
            <Ionicons name="calendar" size={18} color={theme.primary} />
            <Text style={[styles.cardTitle, { color: theme.text, flex: 1, marginBottom: 0 }]}>
              {selectedIsToday
                ? t('training.todaysWorkout')
                : selected.toLocaleDateString(locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })}
            </Text>
          </View>
          <View style={{ marginTop: Spacing.sm }}>
            <Sortable.Grid
              columns={1}
              rowGap={0}
              data={visiblePlanIds}
              keyExtractor={(exId) => exId}
              // A press-and-hold, so tapping a row, its checkbox or its × still
              // works and the page keeps scrolling normally.
              dragActivationDelay={220}
              hapticsEnabled
              // Lets the page scroll itself when a drag reaches either edge.
              scrollableRef={pageRef}
              onDragStart={() => setDragging(true)}
              onDragEnd={({ data }) => {
                setDragging(false);
                // Written against this date only. The weekday's plan is
                // untouched, so every other occurrence of it stays as it was.
                setDayOrder(selected, data);
              }}
              renderItem={({ item: exId }) => {
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
              const wTodayCalories = wToday
                ? actualBurnedForWorkout(wToday, selectedDayWorkouts, whoopWorkoutsByDay, calibration)
                : undefined;
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
                      {!!wTodayCalories && (
                        <Text style={{ color: theme.carbs, fontWeight: '700', fontSize: 12, marginEnd: 6 }}>
                          {wTodayCalories} {t('common.kcal')}
                        </Text>
                      )}
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
                  {rows.length > 0 && !dragging && (
                    <View style={styles.setStrip}>
                      {rows.map((s, i) => {
                        // The heaviest set of the row, always — whether it is
                        // a target or already lifted. The two signals stay
                        // separate: the checkmark means trained, the colour
                        // means top set. Tying the colour to this set's own
                        // done flag made it vanish on rows whose flags were
                        // mixed, which is unexplainable from the outside.
                        const top = i === bestSetIndex(rows, type);
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
              }}
            />
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

          {/* Make today repeatable: the session just trained becomes a weekday
              of the schedule, targets and all. Only offered once something is
              actually logged — an untouched plan is already the schedule. */}
          {loggedTodayCount > 0 && (
            <View style={[styles.saveWrap, { borderTopColor: theme.border }]}>
              <Pressable
                onPress={() => setPickingWeekday((v) => !v)}
                style={({ pressed }) => [styles.saveDayBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons
                  name={pickingWeekday ? 'chevron-down' : 'calendar-outline'}
                  size={16}
                  color={theme.primary}
                />
                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>
                  {t('training.saveAsScheduleDay')}
                </Text>
              </Pressable>
              {pickingWeekday && (
                <>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6 }}>
                    {t('training.pickWeekday')}
                  </Text>
                  <View style={styles.chipWrap}>
                    {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
                      const has = (schedule[wd]?.exerciseIds.length ?? 0) > 0;
                      return (
                        <Pressable
                          key={wd}
                          onPress={() => saveToWeekday(wd)}
                          style={({ pressed }) => [
                            styles.chip,
                            { backgroundColor: theme.cardSubtle },
                            pressed && { transform: [{ scale: 0.95 }] },
                          ]}
                        >
                          {/* A dot marks a weekday that already has a plan, so
                              the "replace or add?" question is not a surprise. */}
                          {has && <View style={[styles.chipDot, { backgroundColor: theme.primary }]} />}
                          <Text
                            style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}
                          >
                            {weekdayLabel(wd, locale)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}
        </Card>
      ) : (
        // A day with nothing planned and nothing logged. Says so plainly rather
        // than repeating the schedule link that sits directly above.
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="bed-outline" size={32} color={theme.textTertiary} />
          <Text style={{ color: theme.text, fontWeight: '700' }}>
            {selectedIsToday ? t('training.restDay') : t('training.nothingLogged')}
          </Text>
          <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 13 }}>
            {t('training.restDayHint')}
          </Text>
        </View>
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
          const dayBurn = g.items.reduce(
            (s, w) => s + actualBurnedForWorkout(w, g.items, whoopWorkoutsByDay, calibration),
            0,
          );
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
                  const wCalories = actualBurnedForWorkout(w, g.items, whoopWorkoutsByDay, calibration);
                  const wFromWhoop = whoopKcalForWorkout(w, g.items, whoopWorkoutsByDay[g.key] ?? []) != null;
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
                        {!!wCalories && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {wFromWhoop && <Ionicons name="watch-outline" size={11} color={theme.carbs} />}
                            <Text style={{ color: theme.carbs, fontWeight: '700', fontSize: 12 }}>
                              {wCalories} {t('common.kcal')}
                            </Text>
                          </View>
                        )}
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
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  burnIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnValue: { fontSize: 26, fontWeight: '800' },
  burnUnit: { fontSize: 14, fontWeight: '600' },
  whoopBreakdown: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  whoopBreakdownTitle: { fontSize: 12, fontWeight: '700', marginBottom: Spacing.xs },
  whoopBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm },
  routineHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  scheduleIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveWrap: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 4,
  },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
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
