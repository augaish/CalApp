import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { CollapsingScreen } from '@/components/collapsing-screen';
import { ActionButton, Chip, EmptyState, IconTile, RowGroup, SectionTitle, SettingsRow, StatusPill } from '@/components/system';
import { Button } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchWhoopDayBurn, fetchWhoopHistory } from '@/lib/api';
import { useCelebrate } from '@/lib/celebrate';
import { useViewDay } from '@/lib/day';
import { exerciseName, findExercise, MUSCLE_COLORS } from '@/lib/exercises';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { keyToDate, pendingOccurrences, resolvePlan } from '@/lib/occurrences';
import { usePending } from '@/lib/pending';
import { useTourTarget } from '@/lib/tour';
import {
  actualBurnedForDay,
  applyOrder,
  bestSetEver,
  bestSetIndex,
  dateKey,
  dayBurnAllocation,
  isSameDay,
  lastSessionBefore,
  setScore,
  useAppStore,
  whoopCalibrationFactor,
  workoutFor,
} from '@/lib/store';
import type { ExerciseType, LoggedWorkout, WorkoutSet } from '@/lib/types';

/** How many trailing days (including today) get a live WHOOP refetch on
 * every Training tab focus, to catch up on WHOOP's own scoring lag. */
const RECENT_WHOOP_DAYS = 3;
/** Follow-up checks a just-logged workout gets; 6 × 45s ≈ 4.5 minutes. */
const WHOOP_POLL_ATTEMPTS = 6;
const WHOOP_POLL_INTERVAL_MS = 45_000;

/** Weekday name in the active locale (Jan 7 2024 was a Sunday). */
function weekdayLabel(i: number, locale: string): string {
  return new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'long' });
}

/** Whole minutes, for cardio durations stored as seconds. */
function toMin(seconds: number | undefined): number {
  return Math.round((seconds ?? 0) / 60);
}

/** A rough session length from its shape: roughly nine minutes per exercise
 * of three sets with rest — a planning aid, labelled "about", never a record. */
export function estimateMinutes(exerciseCount: number, setsTotal: number): number {
  if (exerciseCount === 0) return 0;
  const sets = setsTotal > 0 ? setsTotal : exerciseCount * 3;
  return Math.max(10, Math.round((sets * 2.5 + exerciseCount * 2) / 5) * 5);
}

/** How long ago the WHOOP numbers were actually fetched. */
function syncedAgoLabel(iso: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t('training.syncedJustNow');
  if (minutes < 60) return t('training.syncedMinutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('training.syncedHoursAgo', { count: hours });
  return t('training.syncedDaysAgo', { count: Math.floor(hours / 24) });
}

/** One set as it reads on the day's card: the number you are about to lift. */
function setChipLabel(s: WorkoutSet, type: ExerciseType, kg: string, min: string): string {
  if (type === 'weight_reps') return s.weightKg ? `${s.weightKg}${kg} × ${s.reps ?? 0}` : `× ${s.reps ?? 0}`;
  if (type === 'bodyweight_reps') return `× ${s.reps ?? 0}`;
  if (type === 'time') return `${s.seconds ?? 0}s`;
  const parts = [`${toMin(s.seconds)} ${min}`];
  if (s.distanceM) parts.push(`${(s.distanceM / 1000).toFixed(1)} km`);
  return parts.join(' · ');
}

/** Short label of a record set, for the "Best" line under an exercise. */
function bestSetLabel(best: WorkoutSet, type: ExerciseType, kg: string): string {
  if (type === 'weight_reps') return `${best.weightKg ?? 0} ${kg} × ${best.reps ?? 0}`;
  if (type === 'bodyweight_reps') return `× ${best.reps ?? 0}`;
  if (type === 'time') return `${best.seconds ?? 0}s`;
  return `${((best.distanceM ?? 0) / 1000).toFixed(1)} km`;
}

/** "3 sets · 10 reps" when the rows agree on reps, else the chips speak. */
function shapeLabel(rows: WorkoutSet[], type: ExerciseType, t: (k: string, o?: Record<string, unknown>) => string): string | null {
  if (rows.length === 0) return null;
  if (type === 'weight_reps' || type === 'bodyweight_reps') {
    const reps = new Set(rows.map((r) => r.reps ?? 0));
    if (reps.size === 1) return t('training.setsReps', { sets: rows.length, reps: [...reps][0] });
    return t('training.setsOnly', { count: rows.length });
  }
  return t('training.setsOnly', { count: rows.length });
}

/**
 * S05 Training — the active schedule's name and today's actual progress.
 * Start becomes Resume for an unfinished session and Review workout once
 * every planned exercise is done; adding more training stays secondary.
 * Planned targets are labelled and never rendered as completed records.
 */
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
  const savedSchedules = useAppStore((s) => s.savedSchedules);
  const activeScheduleId = useAppStore((s) => s.activeScheduleId);
  const dayOrder = useAppStore((s) => s.dayOrder);
  const setDayOrder = useAppStore((s) => s.setDayOrder);
  const saveDayToSchedule = useAppStore((s) => s.saveDayToSchedule);
  const markExerciseDone = useAppStore((s) => s.markExerciseDone);
  const removeWorkout = useAppStore((s) => s.removeWorkout);
  const setWorkoutTrained = useAppStore((s) => s.setWorkoutTrained);
  const skips = useAppStore((s) => s.skips);
  const activeSession = useAppStore((s) => s.activeSession);
  const startSession = useAppStore((s) => s.startSession);
  const skipPlanToday = useAppStore((s) => s.skipPlanToday);
  const restorePlanToday = useAppStore((s) => s.restorePlanToday);
  const selected = useViewDay((s) => s.day);
  const shift = useViewDay((s) => s.shift);

  const occurrences = useAppStore((s) => s.occurrences);
  const applyOccurrenceMoves = useAppStore((s) => s.applyOccurrenceMoves);
  const undoOccurrenceOp = useAppStore((s) => s.undoOccurrenceOp);
  const lastOp = usePending((s) => s.lastOccurrenceOp);
  const setLastOp = usePending((s) => s.setLastOccurrenceOp);
  // S42: the dated occurrence layer over the weekly template.
  const resolved = resolvePlan(schedule, occurrences, selected);
  const plan = resolved?.day;
  const planWeekday = resolved?.weekday ?? selected.getDay();
  const ownOccurrence = occurrences[dateKey(selected)];
  const pending = pendingOccurrences(schedule, occurrences, workouts, skips, new Date());
  const nextPending = pending[0];
  const skippedIds = skips[dateKey(selected)] ?? [];
  const scheduledIds = plan ? plan.exerciseIds.filter((id) => !skippedIds.includes(id)) : [];
  const skippedPlanIds = plan ? plan.exerciseIds.filter((id) => skippedIds.includes(id)) : [];

  // Anything logged on this day that the weekly schedule does not know about
  // — duplicated from another day, scanned in, or picked from the library.
  const selectedDayWorkouts = workouts.filter((w) => isSameDay(w.at, selected));
  const loggedTodayCount = selectedDayWorkouts.length;
  const unplannedIds = [...new Set(selectedDayWorkouts.map((w) => w.exerciseId))].filter((id) => !scheduledIds.includes(id));
  const visiblePlanIds = applyOrder([...scheduledIds, ...unplannedIds], dayOrder[dateKey(selected)]);

  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const burned = actualBurnedForDay(workouts, whoopBurnByDay, whoopWorkoutsByDay, selected);
  const whoopDayTotal = whoopBurnByDay[dateKey(selected)] ?? null;
  // The same factor `actualBurnedForDay` used for the day total, fed into
  // every per-exercise fallback too, so the rows always add up to the card.
  const calibration = whoopCalibrationFactor(workouts, whoopWorkoutsByDay);
  const whoopCalibrated = whoopDayTotal == null && calibration !== 1;
  const selectedDayAllocation = dayBurnAllocation(workouts, selected, whoopBurnByDay, whoopWorkoutsByDay, calibration);
  const kg = t('progress.kg');
  const min = t('track.min');
  const activeSchedule = savedSchedules.find((s) => s.id === activeScheduleId);
  const scheduleName = activeSchedule ? activeSchedule.name || t('schedules.defaultName') : t('today.myPlan');

  const [whoopConnected, setWhoopConnected] = useState<boolean | null>(null);
  const [whoopPending, setWhoopPending] = useState(false);
  // Only the response from the most recently issued request is ever applied.
  const whoopRequestGen = useRef(0);

  const refreshWhoopRecent = useCallback((): Promise<boolean> => {
    const gen = ++whoopRequestGen.current;
    const fetches: Promise<void>[] = [];
    let todayPending = false;
    for (let i = 0; i < RECENT_WHOOP_DAYS; i++) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      fetches.push(
        fetchWhoopDayBurn(start.toISOString(), end.toISOString()).then(({ totalKcal, workouts: w, connected, pending }) => {
          if (gen !== whoopRequestGen.current) return;
          setWhoopDayBurn(day, totalKcal);
          setWhoopDayWorkouts(day, w);
          if (i === 0) {
            setWhoopLastFetchedAt(new Date().toISOString());
            setWhoopConnected(connected ?? null);
            setWhoopPending(!!pending);
            todayPending = !!pending;
          }
        }),
      );
    }
    return Promise.all(fetches).then(() => todayPending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedTodayCount]);

  useFocusEffect(
    useCallback(() => {
      refreshWhoopRecent();
    }, [refreshWhoopRecent]),
  );

  // After logging something today, poll a handful of times for WHOOP's own
  // scoring instead of leaving the number stuck until the tab is reopened.
  useEffect(() => {
    if (!selectedIsToday || loggedTodayCount === 0) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      if (cancelled) return;
      refreshWhoopRecent().then((stillPending) => {
        if (cancelled) return;
        attempt += 1;
        if (stillPending && attempt < WHOOP_POLL_ATTEMPTS) timer = setTimeout(poll, WHOOP_POLL_INTERVAL_MS);
      });
    };
    timer = setTimeout(poll, WHOOP_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loggedTodayCount, selectedIsToday, refreshWhoopRecent]);

  // One-time (then daily-refreshed) backfill of WHOOP history.
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
        setWhoopDayWorkouts(day, dayEntries.map(({ localDate: _localDate, ...w }) => w));
      }
      setWhoopBackfilledAt(new Date().toISOString());
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pickingWeekday, setPickingWeekday] = useState(false);
  // While a row is held, the set chips collapse away so the list fits.
  const [dragging, setDragging] = useState(false);
  const pageRef = useAnimatedRef<ScrollView>();
  const scheduleTarget = useTourTarget('training.schedule');
  const todayTarget = useTourTarget('training.today');

  const openExercise = (id: string) => router.push(`/exercise-detail?id=${encodeURIComponent(id)}`);

  const confirmDeleteWorkout = (id: string) =>
    Alert.alert(t('training.deleteWorkoutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeWorkout(id) },
    ]);

  /** Turn what was trained today into a weekday of the weekly schedule. */
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
    if (existing.length === 0) return commit('replace');
    Alert.alert(t('training.scheduleExists', { day: label }), t('training.scheduleExistsBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('training.scheduleMerge'), onPress: () => commit('merge') },
      { text: t('training.scheduleReplace'), style: 'destructive', onPress: () => commit('replace') },
    ]);
  };

  // Done/undone toggle — never navigates and never loses your numbers.
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
    markExerciseDone({ id: exId, name: ex ? exerciseName(ex, lang) : exId, type: ex?.type ?? 'weight_reps', category: ex?.category }, selected);
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.workoutDone'));
  };

  // Today's shape for the card: how many done, and a length estimate.
  const doneIds = new Set(selectedDayWorkouts.filter((w) => w.sets.some((s) => s.done)).map((w) => w.exerciseId));
  const doneCount = visiblePlanIds.filter((id) => doneIds.has(id)).length;
  const allDone = visiblePlanIds.length > 0 && doneCount >= visiblePlanIds.length;
  const plannedSetsTotal = visiblePlanIds.reduce((sum, id) => sum + (plan?.plans?.[id]?.length ?? 0), 0);
  const sessionIsToday = activeSession?.dayKey === dateKey(new Date());
  const dateLine = selectedIsToday
    ? `${t('home.today')}, ${selected.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`
    : selected.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  // Everything under the brand row scrolls away with the content; the
  // compact bar keeps the brand, AI Support and Profile within reach.
  const header = (
    <>
      <View style={styles.dateRow}>
        <View style={{ flex: 1 }}>
          <Text style={[Type.title, { color: theme.onGradient }]}>{t('tabs.training')}</Text>
          <Pressable onPress={() => router.push('/calendar')} accessibilityRole="button" accessibilityLabel={dateLine} hitSlop={6}>
            <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '500' }}>{dateLine}</Text>
          </Pressable>
        </View>
        <View style={[styles.arrows, { direction: 'ltr' }]}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.arrow}>
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.95)" />
          </Pressable>
          <Pressable onPress={() => shift(1)} hitSlop={10} disabled={selectedIsToday} accessibilityRole="button" accessibilityLabel={t('common.next')} style={styles.arrow}>
            <Ionicons name="chevron-forward" size={20} color={selectedIsToday ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.95)'} />
          </Pressable>
        </View>
      </View>
      <Pressable
        {...scheduleTarget.bind}
        onPress={() => router.push('/schedules')}
        accessibilityRole="button"
        accessibilityLabel={`${scheduleName} · ${t('training.change')}`}
        style={({ pressed }) => [styles.schedulePill, { backgroundColor: 'rgba(255,255,255,0.92)' }, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="barbell" size={16} color={theme.primary} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>
          {activeSchedule ? t('training.activeSchedule', { name: scheduleName }) : t('training.noSavedSchedule')}
        </Text>
        <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>{t('training.change')}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.primary} />
      </Pressable>
    </>
  );

  return (
    <CollapsingScreen title={t('common.appName')} compactTitle={t('tabs.training')} header={header} scrollRef={pageRef}>
      {lastOp && (
        <View style={[styles.undoBar, { backgroundColor: theme.surfaceTint }]}>
          <Ionicons name="swap-horizontal" size={16} color={theme.primaryDark} />
          <Text style={{ color: theme.primaryDark, fontSize: 13, flex: 1 }} numberOfLines={2}>
            {lastOp.label}
          </Text>
          <Pressable
            onPress={() => {
              if (!undoOccurrenceOp(lastOp.opId)) Alert.alert(t('reschedule.undoFailedTitle'), t('reschedule.undoFailedBody'));
              setLastOp(null);
            }}
            accessibilityRole="button"
            hitSlop={6}
          >
            <Text style={{ color: theme.primary, fontWeight: '800' }}>{t('reschedule.undo')}</Text>
          </Pressable>
          <Pressable onPress={() => setLastOp(null)} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={6}>
            <Ionicons name="close" size={16} color={theme.textTertiary} />
          </Pressable>
        </View>
      )}

      {/* S42: a pending past workout is a calm next step, never a failure. */}
      {selectedIsToday && nextPending && !activeSession && (
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.ms }}>
            <IconTile icon="time-outline" size={44} />
            <View style={{ flex: 1 }}>
              <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{t('reschedule.nextWorkout')}</Text>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>{nextPending.day.title || t('training.todaysWorkout')}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {t('reschedule.plannedFor', { date: keyToDate(nextPending.scheduledDate).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }) })} · {t('training.exerciseCount', { count: nextPending.exerciseIds.length })}
              </Text>
            </View>
          </View>
          <ActionButton label={t('reschedule.doToday')} icon="play" onPress={() => router.push(`/reschedule?date=${nextPending.originalDate}&to=${dateKey(new Date())}`)} style={{ marginTop: Spacing.ms }} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
            <ActionButton label={t('reschedule.move')} icon="calendar-outline" variant="secondary" onPress={() => router.push(`/reschedule?date=${nextPending.originalDate}`)} style={{ flex: 1 }} />
            <ActionButton
              label={t('reschedule.skip')}
              variant="secondary"
              onPress={() => {
                lightHaptic();
                const opId = `op:${Date.now()}`;
                const ok = applyOccurrenceMoves([{ originalDate: nextPending.originalDate, weekday: nextPending.weekday, to: null }], { [nextPending.originalDate]: occurrences[nextPending.originalDate]?.revision ?? 0 }, opId);
                if (ok) setLastOp({ opId, label: t('reschedule.skippedLabel', { name: nextPending.day.title || t('training.todaysWorkout') }) });
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      <SectionTitle style={{ marginTop: Spacing.xs }}>{selectedIsToday ? t('home.today') : selected.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}</SectionTitle>
      {resolved?.movedFrom && (
        <View style={{ marginBottom: Spacing.sm, alignSelf: 'flex-start' }}>
          <StatusPill label={t('reschedule.movedFrom', { date: keyToDate(resolved.movedFrom).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }) })} tone="planned" icon="swap-horizontal" />
        </View>
      )}
      {!resolved && ownOccurrence && (
        <View style={{ marginBottom: Spacing.sm, alignSelf: 'flex-start' }}>
          <StatusPill
            label={
              ownOccurrence.state === 'skipped'
                ? t('reschedule.skippedPill')
                : t('reschedule.movedTo', { date: keyToDate(ownOccurrence.scheduledDate!).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }) })
            }
            tone="neutral"
            icon="swap-horizontal"
          />
        </View>
      )}

      <View {...todayTarget.bind}>
      {visiblePlanIds.length > 0 ? (
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[styles.planTitle, { color: theme.text }]}>{plan?.title || t('training.todaysWorkout')}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }}>
            {t('training.exerciseCount', { count: visiblePlanIds.length })}
            {doneCount > 0 ? ` · ${t('today.doneOf', { done: doneCount, total: visiblePlanIds.length })}` : ` · ${t('training.aboutMinutes', { n: estimateMinutes(visiblePlanIds.length, plannedSetsTotal) })}`}
          </Text>

          <View style={{ marginTop: Spacing.ms }}>
            {activeSession ? (
              <Button
                label={
                  sessionIsToday
                    ? t('session.resume')
                    : t('session.finishUnfinished', {
                        date: (() => {
                          const [y, m, d] = activeSession.dayKey.split('-').map(Number);
                          return new Date(y, m, d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
                        })(),
                      })
                }
                icon="play"
                onPress={() => router.push('/session')}
              />
            ) : allDone ? (
              <View style={[styles.doneBar, { backgroundColor: theme.surfaceTint }]}>
                <Ionicons name="checkmark-circle" size={18} color={theme.successText} />
                <Text style={{ color: theme.successText, fontWeight: '700', flex: 1 }}>{t('today.workoutDone')}</Text>
                <Pressable onPress={() => router.push('/workout-history')} accessibilityRole="button" hitSlop={6}>
                  <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('training.reviewWorkout')}</Text>
                </Pressable>
              </View>
            ) : selectedIsToday ? (
              <Button
                label={t('session.start')}
                icon="play"
                onPress={() => {
                  startSession(selected, visiblePlanIds);
                  router.push('/session');
                }}
              />
            ) : null}
          </View>

          <View style={[styles.list, { borderColor: theme.border }]}>
            <Sortable.Grid
              columns={1}
              rowGap={0}
              data={visiblePlanIds}
              keyExtractor={(exId) => exId}
              dragActivationDelay={220}
              hapticsEnabled
              scrollableRef={pageRef}
              onDragStart={() => setDragging(true)}
              onDragEnd={({ data }) => {
                setDragging(false);
                // Written against this date only; the weekday's plan is untouched.
                setDayOrder(selected, data);
              }}
              renderItem={({ item: exId, index }) => {
                const ex = findExercise(exId, custom);
                const wToday = workoutFor(workouts, exId, selected);
                const doneToday = !!wToday && wToday.sets.some((s) => s.done);
                const planned = plan?.plans?.[exId] ?? [];
                const type = ex?.type ?? 'weight_reps';
                const accent = ex ? MUSCLE_COLORS[ex.category] : theme.primary;
                // Today's sets, else last time's, else the plan — and the
                // strip says which, so the numbers never look invented.
                const lastSession = lastSessionBefore(workouts, exId, selected);
                const source: 'today' | 'last' | 'plan' = wToday?.sets.length ? 'today' : lastSession?.sets.length ? 'last' : 'plan';
                const rows: WorkoutSet[] = (
                  source === 'today' ? [...wToday!.sets] : source === 'last' ? lastSession!.sets.map((s) => ({ ...s, done: false })) : planned.map((p) => ({ ...p, done: false }))
                ).sort((a, b) => setScore(a, type) - setScore(b, type));
                const best = bestSetEver(workouts, exId);
                const wTodayCalories = wToday ? selectedDayAllocation.get(wToday.id) : undefined;
                const shape = shapeLabel(rows, type, t);
                return (
                  <View key={exId} style={[styles.exRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                    <Pressable
                      onPress={() => checkOff(exId)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: doneToday }}
                      accessibilityLabel={ex ? exerciseName(ex, lang) : exId}
                    >
                      <View style={[styles.numBadge, doneToday ? { backgroundColor: theme.primary } : { backgroundColor: theme.surfaceTint }]}>
                        {doneToday ? (
                          <Ionicons name="checkmark" size={16} color={theme.onPrimary} />
                        ) : (
                          <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 14 }}>{index + 1}</Text>
                        )}
                      </View>
                    </Pressable>
                    <Pressable style={({ pressed }) => [styles.exTap, pressed && { opacity: 0.6 }]} onPress={() => openExercise(exId)} accessibilityRole="button">
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
                          {ex ? exerciseName(ex, lang) : exId}
                        </Text>
                        {!!shape && (
                          <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                            {source !== 'today' ? `${t(source === 'last' ? 'training.lastTime' : 'training.planned')} · ` : ''}
                            {shape}
                            {wTodayCalories ? ` · ${wTodayCalories} ${t('common.kcal')}` : ''}
                          </Text>
                        )}
                        {best && (
                          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                            {t('training.best')} {bestSetLabel(best.set, best.type, kg)}
                          </Text>
                        )}
                        {rows.length > 0 && !dragging && (
                          <View style={styles.setStrip}>
                            {rows.map((s, i) => {
                              const top = i === bestSetIndex(rows, type);
                              return (
                                <View key={i} style={[styles.setChip, top ? { backgroundColor: accent + '22', borderColor: accent + '55' } : { backgroundColor: theme.surfaceTint, borderColor: 'transparent' }]}>
                                  <Text style={{ color: top ? accent : theme.textSecondary, fontSize: 11, fontWeight: top ? '800' : '600' }}>{setChipLabel(s, type, kg, min)}</Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                    </Pressable>
                    <Pressable
                      onPress={() => (scheduledIds.includes(exId) ? skipPlanToday(selected, exId) : wToday && confirmDeleteWorkout(wToday.id))}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.delete')}
                      style={styles.skipBtn}
                    >
                      <Ionicons name="close" size={18} color={theme.textTertiary} />
                    </Pressable>
                  </View>
                );
              }}
            />
          </View>

          {skippedPlanIds.length > 0 && (
            <View style={{ marginTop: Spacing.sm }}>
              <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 6 }}>{t('training.skippedToday')}</Text>
              <View style={styles.chipWrap}>
                {skippedPlanIds.map((exId) => {
                  const ex = findExercise(exId, custom);
                  return <Chip key={exId} label={ex ? exerciseName(ex, lang) : exId} icon="arrow-undo" selected={false} onPress={() => restorePlanToday(selected, exId)} />;
                })}
              </View>
            </View>
          )}

          <Pressable
            onPress={() => router.push(`/schedule-plan?weekday=${planWeekday}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.editPlan, { backgroundColor: theme.surfaceTint }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="pencil-outline" size={16} color={theme.primary} />
            <Text style={{ color: theme.primaryDark, fontWeight: '700', flex: 1 }}>{t('training.editTodaysPlan')}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.primary} />
          </Pressable>

          {loggedTodayCount > 0 && (
            <View style={{ marginTop: Spacing.sm }}>
              <Pressable onPress={() => setPickingWeekday((v) => !v)} accessibilityRole="button" style={({ pressed }) => [styles.saveDayBtn, pressed && { opacity: 0.6 }]}>
                <Ionicons name={pickingWeekday ? 'chevron-down' : 'calendar-outline'} size={16} color={theme.primary} />
                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>{t('training.saveAsScheduleDay')}</Text>
              </Pressable>
              {pickingWeekday && (
                <>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6 }}>{t('training.pickWeekday')}</Text>
                  <View style={styles.chipWrap}>
                    {[0, 1, 2, 3, 4, 5, 6].map((wd) => (
                      <Chip key={wd} label={weekdayLabel(wd, locale)} selected={(schedule[wd]?.exerciseIds.length ?? 0) > 0} onPress={() => saveToWeekday(wd)} />
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      ) : (
        <EmptyState
          icon="bed-outline"
          title={selectedIsToday ? t('training.restDay') : t('training.nothingLogged')}
          body={t('training.restDayHint')}
          action={{ label: t('training.addExercise'), icon: 'add', onPress: () => router.push('/exercise-library') }}
          secondary={{ label: t('training.editTodaysPlan'), icon: 'pencil-outline', onPress: () => router.push(`/schedule-plan?weekday=${planWeekday}`) }}
        />
      )}
      </View>

      {/* Secondary ways in, as a slim row under the day rather than a pinned
          footer that took a fifth of the screen from the workout itself. */}
      <View style={styles.quickRow}>
        <ActionButton label={t('training.addExercise')} icon="add" variant="secondary" onPress={() => router.push('/exercise-library')} style={{ flex: 1 }} />
        <ActionButton label={t('training.scanCta')} icon="scan-outline" variant="secondary" onPress={() => router.push('/scan?mode=gym')} style={{ flex: 1 }} />
      </View>

      {/* Energy — its source is always stated (WHOOP, calibrated estimate, or formula). */}
      <View style={[styles.rowCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <IconTile icon="flame" color={theme.carbs} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>
            {burned} {t('common.kcal')}
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}> · {t('training.burned')}</Text>
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
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
          {selectedIsToday && whoopConnected === true && whoopLastFetchedAt && (
            <Pressable onPress={refreshWhoopRecent} hitSlop={8} style={styles.syncRow} accessibilityRole="button">
              <Ionicons name="refresh" size={11} color={theme.textTertiary} />
              <Text style={{ color: theme.textTertiary, fontSize: 11 }}>{t('training.lastSynced', { time: syncedAgoLabel(whoopLastFetchedAt, t) })}</Text>
            </Pressable>
          )}
        </View>
        {selectedIsToday && whoopConnected === false && <ActionButton label={t('profile.connect')} variant="secondary" onPress={() => router.push('/connections')} />}
        {activeSession && sessionIsToday && <StatusPill label={t('today.inProgress')} tone="active" icon="play" />}
      </View>

      <RowGroup>
        <SettingsRow icon="time-outline" title={t('training.workoutHistory')} subtitle={t('training.workoutHistoryHint')} onPress={() => router.push('/workout-history')} />
        <SettingsRow icon="calendar-outline" title={t('schedules.title')} subtitle={activeSchedule ? t('training.activeSchedule', { name: scheduleName }) : t('schedules.subtitle')} onPress={() => router.push('/schedules')} last />
      </RowGroup>
    </CollapsingScreen>
  );
}

/** Kept for the history screen, which summarises a logged exercise the same way. */
export function summarize(w: LoggedWorkout, sets: string, top: string, kg: string): string {
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

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.ms },
  arrows: { flexDirection: 'row', gap: 2 },
  arrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  schedulePill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.control, paddingHorizontal: Spacing.ms, minHeight: 44 },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  planTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  undoBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.control, paddingHorizontal: Spacing.ms, minHeight: 44, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  doneBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.control, paddingHorizontal: Spacing.md, minHeight: 48 },
  list: { marginTop: Spacing.ms, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.control, paddingHorizontal: Spacing.sm },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.ms },
  exTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  numBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  setStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  setChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  skipBtn: { padding: 4 },
  editPlan: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.control, paddingHorizontal: Spacing.md, minHeight: 48, marginTop: Spacing.ms },
  saveDayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginBottom: 4, minHeight: 44 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
});
