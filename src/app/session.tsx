import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { BodyMap, BodyMapViewSwitch, viewForGroup, viewForMuscles } from '@/components/body-map';
import { Button, Card, Screen, Stepper } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor } from '@/lib/day';
import { exerciseName, findExercise, MUSCLE_COLORS } from '@/lib/exercises';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import {
  bestSetIndex,
  dayBurnAllocation,
  historyFor,
  isSameDay,
  useAppStore,
  whoopCalibrationFactor,
  workoutFor,
} from '@/lib/store';
import type { ExerciseType, PlannedSet, WorkoutSet } from '@/lib/types';

const REST_OPTIONS = [60, 90, 120];

/** Inverse of store.dateKey (local y-m-d, month zero-based). */
function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m, d);
}

type SetShape = Pick<WorkoutSet, 'weightKg' | 'reps' | 'seconds' | 'distanceM'>;

/**
 * The workout as it happens: one exercise at a time, target and last-time
 * values next to the inputs, one tap to complete a set, an automatic rest
 * countdown, and a summary before finishing. Every completed set is written
 * straight into `workouts` — the same record the Track tab edits — so
 * leaving mid-session (or the phone dying) loses nothing; the persisted
 * ActiveSession only remembers where you were.
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
  const whoopBurnByDay = useAppStore((s) => s.whoopBurnByDay);
  const whoopWorkoutsByDay = useAppStore((s) => s.whoopWorkoutsByDay);
  const logSet = useAppStore((s) => s.logSet);
  const removeSet = useAppStore((s) => s.removeSet);
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
  const planned: PlannedSet[] = (exId && schedule[day.getDay()]?.plans?.[exId]) || [];
  const todayWorkout = exId ? workoutFor(workouts, exId, day) : undefined;
  const doneSets = todayWorkout?.sets.filter((s) => s.done) ?? [];
  const setNo = doneSets.length;
  const target: SetShape | undefined = planned[setNo] ?? planned[planned.length - 1];
  const lastSession = exId
    ? historyFor(workouts, exId).find((w) => !isSameDay(w.at, day))
    : undefined;
  const previous: SetShape | undefined =
    lastSession?.sets[setNo] ?? lastSession?.sets[lastSession.sets.length - 1];

  // This set's inputs: prefilled from the plan's target, else what was lifted
  // last time, else the set just completed — so an unchanged set is one tap.
  // Hand edits are kept per (exercise, set number) and simply fall away when
  // either changes, rather than being synced back and forth in an effect.
  const prefillKey = `${exId ?? ''}:${setNo}`;
  const prefillSrc = target ?? previous ?? doneSets[doneSets.length - 1];
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

  const defaultView = ex?.primaryMuscles?.length
    ? viewForMuscles(ex.primaryMuscles)
    : ex
      ? viewForGroup(ex.category)
      : null;
  const [viewOverride, setViewOverride] = useState<{ key: string; view: 'front' | 'back' } | null>(null);
  const mapView = viewOverride && viewOverride.key === exId ? viewOverride.view : defaultView;

  useEffect(() => {
    if (!session && router.canGoBack()) router.back();
  }, [session, router]);

  // One clock for the rest countdown and the elapsed time.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const restRemaining = session?.restEndsAt
    ? Math.max(0, Math.ceil((new Date(session.restEndsAt).getTime() - now) / 1000))
    : 0;
  useEffect(() => {
    if (session?.restEndsAt && restRemaining === 0) updateSession({ restEndsAt: null });
  }, [session?.restEndsAt, restRemaining, updateSession]);

  if (!session) return null;

  const kg = t('progress.kg');
  const total = session.exerciseIds.length;
  const isLast = index >= total - 1;
  const nextEx = !isLast ? findExercise(session.exerciseIds[index + 1], custom) : undefined;
  const allPlannedDone = planned.length > 0 && setNo >= planned.length;

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

  const completeSet = () => {
    if (!ex) return;
    const set: WorkoutSet = {
      weightKg: type === 'weight_reps' ? weight : undefined,
      reps: type === 'weight_reps' || type === 'bodyweight_reps' ? reps : undefined,
      seconds: type === 'time' || type === 'distance_time' ? seconds : undefined,
      distanceM: type === 'distance_time' ? distance : undefined,
      done: true,
    };
    logSet({ id: ex.id, name: exerciseName(ex, lang), type, category: ex.category }, set, timestampFor(day));
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.setLogged'));
    updateSession({ restEndsAt: new Date(Date.now() + session.restSeconds * 1000).toISOString() });
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

  // ── Summary ────────────────────────────────────────────────────────────
  if (showSummary) {
    const allocation = dayBurnAllocation(
      workouts,
      day,
      whoopBurnByDay,
      whoopWorkoutsByDay,
      whoopCalibrationFactor(workouts, whoopWorkoutsByDay),
    );
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
        footer={
          <View style={{ gap: Spacing.xs }}>
            <Button label={t('session.saveWorkout')} icon="checkmark-circle" onPress={finishAndSave} />
            {!stale && (
              <Button label={t('session.keepGoing')} variant="ghost" onPress={() => setFinishing(false)} />
            )}
          </View>
        }
      >
        <Text style={[Type.title, { color: theme.text }]}>{t('session.summaryTitle')}</Text>
        <View style={styles.statRow}>
          <Card style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {elapsedMin} <Text style={styles.statUnit}>{t('session.minutes')}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{t('session.elapsed')}</Text>
          </Card>
          <Card style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {kcal} <Text style={styles.statUnit}>{t('common.kcal')}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{t('session.burned')}</Text>
          </Card>
        </View>
        <Card>
          {rows.map((r, i) => {
            const bestIdx = r.done.length ? bestSetIndex(r.done, r.w!.type) : -1;
            return (
              <View
                key={r.id}
                style={[styles.summaryRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                    {r.e ? exerciseName(r.e, lang) : r.id}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {r.done.length > 0
                      ? `${t('track.setsSummary', { count: r.done.length })} · ${t('session.best')} ${label(r.done[bestIdx])}`
                      : t('session.notStarted')}
                  </Text>
                </View>
                <Ionicons
                  name={r.done.length > 0 ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={r.done.length > 0 ? theme.success : theme.textTertiary}
                />
              </View>
            );
          })}
        </Card>
      </Screen>
    );
  }

  // ── Live session ───────────────────────────────────────────────────────
  const accent = ex ? MUSCLE_COLORS[ex.category] : theme.primary;
  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Button label={t('session.completeSet')} icon="checkmark" onPress={completeSet} style={{ flex: 2 }} />
          <Button label={t('session.finish')} variant="secondary" onPress={() => setFinishing(true)} style={{ flex: 1 }} />
        </View>
      }
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-down" size={26} color={theme.text} />
        </Pressable>
        <Text style={[Type.title, { color: theme.text, flex: 1, marginBottom: 0 }]}>{t('session.title')}</Text>
        <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>
          {t('session.progress', { current: index + 1, total })}
        </Text>
      </View>
      <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: Spacing.md }}>
        {t('session.leaveHint')}
      </Text>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <View style={[styles.tag, { backgroundColor: accent + '22' }]}>
            <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>
              {ex ? t(`muscles.${ex.category}`) : ''}
            </Text>
          </View>
          {planned.length > 0 && (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {t('session.setsOfPlanned', { done: setNo, planned: planned.length })}
            </Text>
          )}
        </View>
        <Text style={[styles.exerciseName, { color: theme.text }]}>{ex ? exerciseName(ex, lang) : exId}</Text>
        <Text style={{ color: theme.textTertiary, fontSize: 13 }}>
          {nextEx
            ? `${t('session.nextUp')}: ${exerciseName(nextEx, lang)}`
            : t('session.lastExercise')}
        </Text>
      </Card>

      {restRemaining > 0 && (
        <Card style={[styles.restCard, { backgroundColor: theme.cardSubtle }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('session.rest')}</Text>
            <Text style={[styles.restTime, { color: theme.primary }]}>
              {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, '0')}
            </Text>
          </View>
          <Button label={t('session.skipRest')} variant="ghost" onPress={() => updateSession({ restEndsAt: null })} />
        </Card>
      )}

      <Card>
        <View style={styles.setHead}>
          <Text style={[styles.setTitle, { color: theme.text }]}>{t('session.setNumber', { n: setNo + 1 })}</Text>
          {allPlannedDone && (
            <Text style={{ color: theme.success, fontSize: 12, fontWeight: '600', flex: 1 }}>
              {t('session.allPlannedDone')}
            </Text>
          )}
        </View>
        <View style={styles.refRow}>
          <View style={styles.ref}>
            <Text style={[styles.refLabel, { color: theme.textTertiary }]}>{t('session.target')}</Text>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{label(target)}</Text>
          </View>
          <View style={styles.ref}>
            <Text style={[styles.refLabel, { color: theme.textTertiary }]}>{t('session.previous')}</Text>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{label(previous)}</Text>
          </View>
        </View>
        <Text style={[styles.refLabel, { color: theme.textTertiary, marginTop: Spacing.sm }]}>{t('session.thisSet')}</Text>
        <View style={styles.stepperRow}>
          {type === 'weight_reps' && (
            <Stepper
              label={`${t('track.weight')} (${kg})`}
              value={weight}
              onChange={(v) => edit({ weightKg: v })}
              step={2.5}
              decimals={1}
            />
          )}
          {(type === 'weight_reps' || type === 'bodyweight_reps') && (
            <Stepper label={t('track.reps')} value={reps} onChange={(v) => edit({ reps: v })} step={1} />
          )}
          {(type === 'time' || type === 'distance_time') && (
            <Stepper label={t('track.seconds')} value={seconds} onChange={(v) => edit({ seconds: v })} step={5} />
          )}
          {type === 'distance_time' && (
            <Stepper label={t('track.distance')} value={distance} onChange={(v) => edit({ distanceM: v })} step={100} />
          )}
        </View>
        <View style={styles.restPick}>
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('session.restLength')}</Text>
          {REST_OPTIONS.map((s) => {
            const on = session.restSeconds === s;
            return (
              <Pressable
                key={s}
                onPress={() => updateSession({ restSeconds: s })}
                style={[styles.chip, { backgroundColor: on ? theme.primary : theme.cardSubtle }]}
              >
                <Text style={{ color: on ? theme.onPrimary : theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
                  {s}s
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {doneSets.length > 0 && (
        <Card>
          <View style={styles.setHead}>
            <Text style={[styles.setTitle, { color: theme.text, flex: 1 }]}>{t('session.loggedToday')}</Text>
            <Pressable onPress={undoLast} hitSlop={8}>
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('session.undoLast')}</Text>
            </Pressable>
          </View>
          {doneSets.map((s, i) => (
            <View key={i} style={styles.doneRow}>
              <Text style={{ color: theme.textSecondary, width: 22 }}>{i + 1}.</Text>
              <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>{label(s)}</Text>
              {i === bestSetIndex(doneSets, type) && <Ionicons name="trophy" size={14} color={theme.carbs} />}
            </View>
          ))}
        </Card>
      )}

      <View style={styles.navRow}>
        <Button
          label={t('session.previousExercise')}
          variant="ghost"
          onPress={() => go(-1)}
          disabled={index === 0}
          style={{ flex: 1 }}
        />
        <Button
          label={isLast ? t('session.finish') : allPlannedDone ? t('session.nextExercise') : t('session.skipExercise')}
          variant="secondary"
          icon={isLast ? 'flag' : 'arrow-forward'}
          onPress={() => (isLast ? setFinishing(true) : go(1))}
          style={{ flex: 1 }}
        />
      </View>

      <Pressable onPress={() => setShowGuidance((v) => !v)} style={styles.guidanceHead}>
        <Ionicons name="body" size={18} color={theme.primary} />
        <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>{t('session.formGuidance')}</Text>
        <Ionicons name={showGuidance ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
      </Pressable>
      {showGuidance && ex && (
        <Card style={styles.guidanceCard}>
          {mapView &&
            (ex.primaryMuscles?.length ? (
              <BodyMap view={mapView} highlightedMuscles={ex.primaryMuscles} secondaryMuscles={ex.secondaryMuscles} size={100} />
            ) : (
              <BodyMap view={mapView} highlighted={[ex.category]} size={100} />
            ))}
          {mapView && (
            <BodyMapViewSwitch view={mapView} onChange={(v) => setViewOverride({ key: exId ?? '', view: v })} />
          )}
          {ex.description ? (
            <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, alignSelf: 'stretch' }}>
              {ex.description}
            </Text>
          ) : null}
          <Pressable onPress={openVideo} style={styles.videoLink}>
            <Ionicons name="logo-youtube" size={18} color="#FF0000" />
            <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{t('session.watchVideo')}</Text>
          </Pressable>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  exerciseName: { fontSize: 24, fontWeight: '800', marginTop: Spacing.sm, marginBottom: 2 },
  restCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  restTime: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  setTitle: { fontSize: 16, fontWeight: '700' },
  refRow: { flexDirection: 'row', gap: Spacing.sm },
  ref: { flex: 1 },
  refLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  stepperRow: { flexDirection: 'row', gap: Spacing.md, marginTop: 4 },
  restPick: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  navRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  guidanceHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  guidanceCard: { alignItems: 'center', gap: Spacing.xs },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs },
  statRow: { flexDirection: 'row', gap: Spacing.sm },
  stat: { flex: 1 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statUnit: { fontSize: 13, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
});
