import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { BodyMap, BodyMapViewSwitch, groupsForCategory, initialBodyView } from '@/components/body-map';
import { PageHeader } from '@/components/brand-header';
import { Stopwatch } from '@/components/stopwatch';
import { ActionButton, Chip, IconTile } from '@/components/system';
import { Button, Screen, Stepper } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resolvePlan } from '@/lib/occurrences';
import { useCelebrate } from '@/lib/celebrate';
import { calendarDaysBetween, timestampFor } from '@/lib/day';
import { exerciseName, findExercise, logStyleFor } from '@/lib/exercises';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import {
  bestSetEver,
  bestSetIndex,
  dayBurnAllocation,
  isSameDay,
  lastSessionBefore,
  useAppStore,
  whoopCalibrationFactor,
  workoutFor,
} from '@/lib/store';
import type { ExerciseType, PlannedSet, WorkoutSet } from '@/lib/types';

const REST_OPTIONS = [60, 90, 120];
/** The rep counts most working sets land on; last time's and the target join them. */
const QUICK_REPS = [6, 8, 10, 12];

/** Inverse of store.dateKey (local y-m-d, month zero-based). */
function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m, d);
}

type SetShape = Pick<WorkoutSet, 'weightKg' | 'reps' | 'seconds' | 'distanceM'>;

/** When a rest of `seconds` starting now would end. Module-level because the
 * React Compiler's purity rule forbids reading the clock inside a component. */
function restEndsAtFrom(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * S06 Session — the workout as it happens. Target (from the plan, with its
 * source), Best (highest load ever) and the latest set at the same reps are
 * three different facts, shown apart. The actual input is dominant; Complete
 * set writes exactly one durable set and starts rest; a displayed target is
 * never marked done. Every completed set goes straight into `workouts`, so
 * leaving mid-session (or the phone dying) loses nothing.
 */
export default function SessionScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  const session = useAppStore((s) => s.activeSession);
  const workouts = useAppStore((s) => s.workouts);
  const custom = useAppStore((s) => s.exercises);
  const schedule = useAppStore((s) => s.schedule);
  const occurrences = useAppStore((s) => s.occurrences);
  const whoopBurnByDay = useAppStore((s) => s.whoopBurnByDay);
  const whoopWorkoutsByDay = useAppStore((s) => s.whoopWorkoutsByDay);
  const logSet = useAppStore((s) => s.logSet);
  const removeSet = useAppStore((s) => s.removeSet);
  const updateSet = useAppStore((s) => s.updateSet);
  const updateSession = useAppStore((s) => s.updateSession);
  const endSession = useAppStore((s) => s.endSession);

  const [finishing, setFinishing] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const dayKeyStr = session?.dayKey;
  const day = useMemo(() => (dayKeyStr ? dayFromKey(dayKeyStr) : new Date()), [dayKeyStr]);
  // A session left over from another day can only be reviewed and closed.
  const stale = !!session && !isSameDay(new Date().toISOString(), day);
  const showSummary = finishing || stale;

  const index = session?.index ?? 0;
  const exId = session?.exerciseIds[index];
  const ex = exId ? findExercise(exId, custom) : undefined;
  const type: ExerciseType = ex?.type ?? 'weight_reps';
  const dayPlan = resolvePlan(schedule, occurrences, day)?.day;
  const planned: PlannedSet[] = (exId && dayPlan?.plans?.[exId]) || [];
  const todayWorkout = exId ? workoutFor(workouts, exId, day) : undefined;
  const doneSets = todayWorkout?.sets.filter((s) => s.done) ?? [];
  const setNo = doneSets.length;
  // Only while the plan actually has a row for this set. Past the plan there
  // is no target, and saying so is the honest answer (AT05).
  const target: SetShape | undefined = planned[setNo];
  // The record to beat, not "whatever came last" (AT03).
  const best = exId ? bestSetEver(workouts, exId) : undefined;
  const lastSession = exId ? lastSessionBefore(workouts, exId, day) : undefined;
  const lastSet: SetShape | undefined = lastSession?.sets[setNo] ?? lastSession?.sets[lastSession.sets.length - 1];

  // Prefill once from the target, else the set just finished, else last
  // time; hand edits are kept per (exercise, set) and never overwritten by
  // a reps change (AT04).
  const prefillKey = `${exId ?? ''}:${setNo}`;
  const prefillSrc = target ?? doneSets[doneSets.length - 1] ?? lastSet;
  const prefill: Required<SetShape> = {
    weightKg: prefillSrc?.weightKg ?? 0,
    reps: prefillSrc?.reps ?? 0,
    seconds: prefillSrc?.seconds ?? 0,
    distanceM: prefillSrc?.distanceM ?? 0,
  };
  const [edits, setEdits] = useState<Partial<SetShape> & { key: string }>({ key: '' });
  const live = edits.key === prefillKey ? edits : { key: prefillKey };
  const weight = live.weightKg ?? prefill.weightKg;
  const reps = live.reps ?? prefill.reps;
  const seconds = live.seconds ?? prefill.seconds;
  const distance = live.distanceM ?? prefill.distanceM;
  const edit = (patch: Partial<SetShape>) => setEdits({ ...live, key: prefillKey, ...patch });

  // Rep counts one tap away: the usual working range plus whatever last
  // time's matching set and the plan ask for, so a repeat is a tap, not typing.
  const quickCounts = new Set<number>(QUICK_REPS);
  if (lastSet?.reps) quickCounts.add(lastSet.reps);
  if (target?.reps) quickCounts.add(target.reps);
  const quickReps = [...quickCounts].sort((a, b) => a - b);

  // iOS's number pad has no Done key; while it is up, the footer offers one.
  const [keyboardShown, setKeyboardShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const defaultView = initialBodyView(ex?.primaryMuscles, ex?.category);
  const [viewOverride, setViewOverride] = useState<{ key: string; view: 'front' | 'back' } | null>(null);
  const mapView = viewOverride && viewOverride.key === exId ? viewOverride.view : defaultView;

  useEffect(() => {
    if (!session && router.canGoBack()) router.back();
  }, [session, router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const restRemaining = session?.restEndsAt ? Math.max(0, Math.ceil((new Date(session.restEndsAt).getTime() - now) / 1000)) : 0;
  useEffect(() => {
    if (session?.restEndsAt && restRemaining === 0) updateSession({ restEndsAt: null });
  }, [session?.restEndsAt, restRemaining, updateSession]);

  if (!session) return null;

  const kg = t('progress.kg');
  const total = session.exerciseIds.length;
  const isLast = index >= total - 1;
  const nextEx = !isLast ? findExercise(session.exerciseIds[index + 1], custom) : undefined;
  const allPlannedDone = planned.length > 0 && setNo >= planned.length;
  const continuous = logStyleFor(ex) === 'continuous';
  const loggedContinuous = continuous && (todayWorkout?.sets.length ?? 0) > 0;

  const label = (s: SetShape | undefined): string => {
    if (!s) return t('session.none');
    switch (type) {
      case 'weight_reps':
        return `${s.weightKg ?? 0} ${kg} × ${s.reps ?? 0}`;
      case 'bodyweight_reps':
        return `${s.reps ?? 0} ${t('session.reps')}`;
      case 'time':
        return `${s.seconds ?? 0} ${t('session.seconds')}`;
      case 'distance_time':
        return `${s.distanceM ?? 0} ${t('session.meters')} · ${s.seconds ?? 0} ${t('session.seconds')}`;
    }
  };

  /** Relative to the day being trained rather than the wall clock. */
  const whenLabel = (iso: string): string => {
    const days = calendarDaysBetween(iso, day);
    if (days <= 0) return t('session.whenToday');
    if (days === 1) return t('session.whenYesterday');
    if (days < 14) return t('session.whenDaysAgo', { days });
    if (days < 60) return t('session.whenWeeksAgo', { weeks: Math.round(days / 7) });
    return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' });

  /** A set from last time fills the fields; Complete set still does the logging. */
  const fillFromLast = (s: SetShape) => {
    lightHaptic();
    edit({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0, seconds: s.seconds ?? 0, distanceM: s.distanceM ?? 0 });
  };

  const completeSet = () => {
    if (!ex) return;
    // A typed number is already in state on every keystroke; closing the
    // keyboard here means this tap does the whole job.
    Keyboard.dismiss();
    const set: WorkoutSet = {
      weightKg: type === 'weight_reps' ? weight : undefined,
      reps: type === 'weight_reps' || type === 'bodyweight_reps' ? reps : undefined,
      seconds: type === 'time' || type === 'distance_time' ? seconds : undefined,
      distanceM: type === 'distance_time' ? distance : undefined,
      done: true,
    };
    if (continuous && todayWorkout && todayWorkout.sets.length > 0) {
      updateSet(todayWorkout.id, 0, set, timestampFor(day));
    } else {
      logSet({ id: ex.id, name: exerciseName(ex, lang), type, category: ex.category }, set, timestampFor(day));
    }
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.setLogged'));
    if (!continuous) updateSession({ restEndsAt: restEndsAtFrom(session.restSeconds) });
  };

  const undoLast = () => {
    if (!todayWorkout || todayWorkout.sets.length === 0) return;
    removeSet(todayWorkout.id, todayWorkout.sets.length - 1);
    updateSession({ restEndsAt: null });
    lightHaptic();
  };

  const go = (delta: number) => {
    const next = Math.min(total - 1, Math.max(0, index + delta));
    if (next === index) return;
    updateSession({ index: next, restEndsAt: null });
    lightHaptic();
  };

  const finishAndSave = () => {
    endSession();
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.workoutDone'));
    if (router.canGoBack()) router.back();
  };

  const openVideo = () => {
    if (!ex) return;
    const query = encodeURIComponent(t('gymResult.videoQuery', { name: exerciseName(ex, lang) }));
    Linking.openURL(`https://www.youtube.com/results?search_query=${query}`);
  };

  const title = dayPlan?.title || t('session.title');
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/training'));

  // ── Summary ────────────────────────────────────────────────────────────
  if (showSummary) {
    const allocation = dayBurnAllocation(workouts, day, whoopBurnByDay, whoopWorkoutsByDay, whoopCalibrationFactor(workouts, whoopWorkoutsByDay));
    const rows = session.exerciseIds.map((id) => {
      const e = findExercise(id, custom);
      const w = workoutFor(workouts, id, day);
      const done = w?.sets.filter((s) => s.done) ?? [];
      return { id, e, w, done };
    });
    const kcal = rows.reduce((sum, r) => sum + (r.w ? (allocation.get(r.w.id) ?? 0) : 0), 0);
    const elapsedMin = Math.max(1, Math.round((now - new Date(session.startedAt).getTime()) / 60_000));
    return (
      <Screen
        header={<PageHeader title={t('session.summaryTitle')} subtitle={title} onBack={() => (stale ? leave() : setFinishing(false))} />}
        footer={
          <View style={{ gap: Spacing.xs }}>
            <Button label={t('session.saveWorkout')} icon="checkmark-circle" onPress={finishAndSave} />
            {!stale && <Button label={t('session.keepGoing')} variant="ghost" onPress={() => setFinishing(false)} />}
          </View>
        }
      >
        <View style={styles.statRow}>
          <View style={[styles.stat, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {elapsedMin} <Text style={styles.statUnit}>{t('session.minutes')}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{t('session.elapsed')}</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {kcal} <Text style={styles.statUnit}>{t('common.kcal')}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{t('session.burned')}</Text>
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          {rows.map((r, i) => {
            const bestIdx = r.done.length ? bestSetIndex(r.done, r.w!.type) : -1;
            return (
              <View key={r.id} style={[styles.summaryRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                    {r.e ? exerciseName(r.e, lang) : r.id}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {r.done.length > 0 ? `${t('track.setsSummary', { count: r.done.length })} · ${t('session.sessionBest')} ${label(r.done[bestIdx])}` : t('session.notStarted')}
                  </Text>
                </View>
                <Ionicons name={r.done.length > 0 ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={r.done.length > 0 ? theme.successText : theme.textTertiary} />
              </View>
            );
          })}
        </View>
        <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center' }}>{t('session.leaveHint')}</Text>
      </Screen>
    );
  }

  // ── Live session ───────────────────────────────────────────────────────
  return (
    <Screen
      header={<PageHeader title={title} subtitle={t('session.exerciseOf', { n: index + 1, total })} onBack={leave} />}
      footer={
        <View style={{ gap: Spacing.xs }}>
          <Button label={continuous ? t('track.saveSession') : t('session.completeSet')} icon="checkmark" onPress={completeSet} />
          {keyboardShown ? (
            <Button label={t('common.done')} variant="secondary" icon="chevron-down" onPress={() => Keyboard.dismiss()} />
          ) : (
            <Button label={t('session.finishWorkout')} variant="secondary" onPress={() => setFinishing(true)} />
          )}
        </View>
      }
    >
      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={[styles.exerciseName, { color: theme.text }]}>{ex ? exerciseName(ex, lang) : exId}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 16, marginTop: 2 }}>
          {continuous
            ? t(loggedContinuous ? 'track.sessionLogged' : 'session.thisSession')
            : allPlannedDone
              ? `${t('session.setNumber', { n: setNo + 1 })} · ${t('session.allPlannedDone')}`
              : planned.length > 0
                ? t('session.setOf', { n: setNo + 1, total: planned.length })
                : t('session.setNumber', { n: setNo + 1 })}
        </Text>

        {/* Target and Best: two different facts, two tiles. No target past the plan. */}
        <View style={styles.refRow}>
          {target && (
            <Pressable
              style={[styles.ref, { backgroundColor: theme.surfaceTint }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('session.target')} ${label(target)} · ${t('session.edit')}`}
              onPress={() => router.push(`/schedule-plan?weekday=${day.getDay()}&id=${encodeURIComponent(exId ?? '')}`)}
            >
              <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{t('session.target')}</Text>
              <Text style={[styles.refValue, { color: theme.text }]}>{label(target)}</Text>
              <Text style={{ color: theme.primaryDark, fontSize: 12, fontWeight: '600' }}>
                {t('session.weeklyPlan')} · {t('session.edit')}
              </Text>
            </Pressable>
          )}
          <View style={[styles.ref, { backgroundColor: theme.surfaceTint }]}>
            <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{t('session.best')}</Text>
            <Text style={[styles.refValue, { color: theme.text }]}>{label(best?.set)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{best ? shortDate(best.at) : t('session.noBestYet')}</Text>
          </View>
        </View>

        {restRemaining > 0 && (
          <View style={[styles.restCard, { backgroundColor: theme.surfaceTint }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('session.rest')}</Text>
              <Text style={[styles.restTime, { color: theme.primary }]}>
                {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, '0')}
              </Text>
            </View>
            <ActionButton label={t('session.skipRest')} variant="secondary" onPress={() => updateSession({ restEndsAt: null })} />
          </View>
        )}

        {/* Last time, set by set, one tap away. The set matching this set
            number is emphasised; the whole session is there because the
            question mid-workout is "what did I do last time", not one row. */}
        {!continuous && (
          <View style={styles.lastTime}>
            <View style={styles.lastTimeHead}>
              <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
              <Text style={[Type.caption, { color: theme.textSecondary, flex: 1 }]}>
                {lastSession ? `${t('session.lastTime')} · ${whenLabel(lastSession.at)}` : t('session.noLastTime')}
              </Text>
            </View>
            {lastSession && (
              <View style={styles.lastTimeRow}>
                {lastSession.sets.map((s, i) => {
                  const current = i === setNo;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => fillFromLast(s)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('session.lastTime')} ${i + 1}: ${label(s)}`}
                      style={({ pressed }) => [
                        styles.lastChip,
                        current ? { backgroundColor: theme.primary } : { backgroundColor: theme.surfaceTint },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={{ color: current ? theme.onPrimary : theme.textSecondary, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                      <Text style={{ color: current ? theme.onPrimary : theme.text, fontSize: 13, fontWeight: '700' }}>{label(s)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {(type === 'time' || type === 'distance_time') && <Stopwatch value={seconds} onChange={(v) => edit({ seconds: v })} compact />}
        {/* Weight and reps share a row so both stay above the keyboard. */}
        <View style={styles.steppers}>
          {type === 'weight_reps' && <Stepper label={`${t('track.weight')} (${kg})`} value={weight} onChange={(v) => edit({ weightKg: v })} step={2.5} decimals={1} />}
          {(type === 'weight_reps' || type === 'bodyweight_reps') && <Stepper label={t('track.reps')} value={reps} onChange={(v) => edit({ reps: v })} step={1} />}
          {(type === 'time' || type === 'distance_time') && <Stepper label={t('track.seconds')} value={seconds} onChange={(v) => edit({ seconds: v })} step={5} />}
          {type === 'distance_time' && <Stepper label={t('track.distance')} value={distance} onChange={(v) => edit({ distanceM: v })} step={100} />}
        </View>

        {(type === 'weight_reps' || type === 'bodyweight_reps') && (
          <View style={styles.quickReps}>
            {quickReps.map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  lightHaptic();
                  edit({ reps: n });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: reps === n }}
                accessibilityLabel={`${n} ${t('session.reps')}`}
                style={({ pressed }) => [
                  styles.quickChip,
                  reps === n ? { backgroundColor: theme.primary } : { backgroundColor: theme.surfaceTint },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={{ color: reps === n ? theme.onPrimary : theme.primaryDark, fontWeight: '700', fontSize: 14 }}>× {n}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>{t('session.restTimer')}</Text>
        <View style={styles.restPick}>
          {REST_OPTIONS.map((s) => (
            <Chip key={s} label={`${s} s`} selected={session.restSeconds === s} onPress={() => updateSession({ restSeconds: s })} />
          ))}
        </View>

        {doneSets.length > 0 && (
          <>
            <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>{t('session.completedSets')}</Text>
            <View style={[styles.doneList, { borderColor: theme.border }]}>
              {doneSets.map((s, i) => (
                <View key={i} style={[styles.doneRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                  <Text style={{ color: theme.textSecondary, width: 24, fontWeight: '700' }}>{i + 1}</Text>
                  <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>{label(s)}</Text>
                  {i === bestSetIndex(doneSets, type) && <Ionicons name="trophy" size={14} color={theme.carbs} />}
                  {i === doneSets.length - 1 && (
                    <Pressable onPress={undoLast} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('session.undoLast')}>
                      <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('session.undo')}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        <Pressable onPress={() => setShowGuidance((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showGuidance }} style={[styles.guidanceHead, { borderColor: theme.border }]}>
          <IconTile icon="document-text-outline" size={32} />
          <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>{t('session.formGuidance')}</Text>
          <Ionicons name={showGuidance ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
        </Pressable>
        {showGuidance && ex && (
          <View style={styles.guidance}>
            {ex.primaryMuscles?.length ? (
              <BodyMap view={mapView} highlightedMuscles={ex.primaryMuscles} secondaryMuscles={ex.secondaryMuscles} size={100} />
            ) : (
              <BodyMap view={mapView} highlighted={groupsForCategory(ex.category)} size={100} />
            )}
            <BodyMapViewSwitch view={mapView} onChange={(v) => setViewOverride({ key: exId ?? '', view: v })} />
            {ex.description ? <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, alignSelf: 'stretch' }}>{ex.description}</Text> : null}
            <Pressable onPress={openVideo} style={styles.videoLink} accessibilityRole="link">
              <Ionicons name="logo-youtube" size={18} color="#FF0000" />
              <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{t('session.watchVideo')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.navRow}>
        <ActionButton label={t('session.previousExercise')} variant="secondary" icon="arrow-back" onPress={() => go(-1)} disabled={index === 0} style={{ flex: 1 }} />
        <ActionButton label={isLast ? t('session.finish') : t('session.nextExercise')} variant="secondary" icon={isLast ? 'flag' : 'arrow-forward'} onPress={() => (isLast ? setFinishing(true) : go(1))} style={{ flex: 1 }} />
      </View>
      <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm }}>
        {nextEx ? `${t('session.nextUp')}: ${exerciseName(nextEx, lang)}` : t('session.lastExercise')} · {t('session.leaveHint')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  exerciseName: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  refRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  ref: { flex: 1, borderRadius: Radius.control, padding: Spacing.ms, gap: 2, minHeight: 78 },
  refValue: { fontSize: 20, fontWeight: '800' },
  restCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.control, padding: Spacing.ms, marginTop: Spacing.md },
  restTime: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  steppers: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  lastTime: { marginTop: Spacing.md, gap: 6 },
  lastTimeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastTimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lastChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.control, paddingHorizontal: 10, minHeight: 36 },
  quickReps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  quickChip: { borderRadius: Radius.full, paddingHorizontal: 12, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  restPick: { flexDirection: 'row', gap: 8 },
  doneList: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.control, paddingHorizontal: Spacing.ms },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, minHeight: 44 },
  guidanceHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.ms, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  guidance: { alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs, minHeight: 40 },
  navRow: { flexDirection: 'row', gap: Spacing.sm },
  statRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  stat: { flex: 1, borderRadius: Radius.module, padding: Spacing.md },
  statValue: { fontSize: 26, fontWeight: '800' },
  statUnit: { fontSize: 13, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
});
