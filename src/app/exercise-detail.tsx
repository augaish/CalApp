import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { BodyMap, BodyMapViewSwitch, viewForGroup, viewForMuscles } from '@/components/body-map';
import { TrendLine } from '@/components/charts';
import { Button, Card, Screen, Stepper } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor, useViewDay } from '@/lib/day';
import { exerciseName, findExercise, MUSCLE_COLORS } from '@/lib/exercises';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import {
  bestSetIndex,
  dateKey,
  dayBurnAllocation,
  historyFor,
  isSameDay,
  useAppStore,
  whoopCalibrationFactor,
  whoopKcalForWorkout,
  workoutFor,
} from '@/lib/store';
import type { ExerciseType, LoggedWorkout, WorkoutSet } from '@/lib/types';

type Tab = 'track' | 'history' | 'graph';

function est1RM(w: number, reps: number): number {
  return Math.round(w * (1 + reps / 30));
}

/** Comparable "best set" metric per exercise type, for the progress graph. */
function sessionMetric(w: LoggedWorkout): number {
  let best = 0;
  for (const s of w.sets) {
    if (w.type === 'bodyweight_reps') best = Math.max(best, s.reps ?? 0);
    else if (w.type === 'time') best = Math.max(best, s.seconds ?? 0);
    else if (w.type === 'distance_time') best = Math.max(best, s.distanceM ?? 0);
    else best = Math.max(best, s.weightKg ?? 0);
  }
  return Math.round(best);
}

/**
 * Tapping a different exercise from Training pushes this same route with a
 * new `id` — the navigator (Android especially) can reuse the already-
 * mounted screen instead of remounting it, which would leave every `useState`
 * below seeded from whichever exercise was viewed *before* this one instead
 * of the exercise actually being shown. Keying the real screen by the
 * exercise's own id (below) forces a genuine remount on every switch, which
 * is the React-recommended way to reset a whole component's state when its
 * subject changes — see https://react.dev/learn/you-might-not-need-an-effect.
 */
export default function ExerciseDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const custom = useAppStore((s) => s.exercises);
  const exercise = id ? findExercise(id, custom) : undefined;

  useEffect(() => {
    if (!exercise && router.canGoBack()) router.back();
  }, [exercise, router]);

  if (!exercise) return null;
  return <ExerciseDetailScreen key={exercise.id} exerciseId={exercise.id} />;
}

function ExerciseDetailScreen({ exerciseId }: { exerciseId: string }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const locale = lang;
  const { width } = useWindowDimensions();

  const custom = useAppStore((s) => s.exercises);
  const workouts = useAppStore((s) => s.workouts);
  const whoopBurnByDay = useAppStore((s) => s.whoopBurnByDay);
  const whoopWorkoutsByDay = useAppStore((s) => s.whoopWorkoutsByDay);
  const schedule = useAppStore((s) => s.schedule);
  const logSet = useAppStore((s) => s.logSet);
  const updateSet = useAppStore((s) => s.updateSet);
  const removeSet = useAppStore((s) => s.removeSet);
  const markExerciseDone = useAppStore((s) => s.markExerciseDone);
  const viewDay = useViewDay((s) => s.day);

  const exercise = findExercise(exerciseId, custom);

  const history = useMemo(
    () => (exercise ? historyFor(workouts, exercise.id) : []),
    [workouts, exercise],
  );
  const today = exercise ? workoutFor(workouts, exercise.id, viewDay) : undefined;
  const todaySets = today?.sets ?? [];
  // Same calibration + day-level cap the Training tab's rows use (see
  // dayBurnAllocation) — otherwise this exercise could show a different
  // number here than it does in the list it was tapped from.
  const todayCalories = today
    ? dayBurnAllocation(
        workouts,
        viewDay,
        whoopBurnByDay,
        whoopWorkoutsByDay,
        whoopCalibrationFactor(workouts, whoopWorkoutsByDay),
      ).get(today.id)
    : undefined;
  const todayFromWhoop = today
    ? whoopKcalForWorkout(
        today,
        workouts.filter((w) => isSameDay(w.at, viewDay)),
        whoopWorkoutsByDay[dateKey(viewDay)] ?? [],
      ) != null
    : false;

  // Opening a scheduled exercise that isn't logged yet pre-fills its sets from
  // your best record / plan, but marks them NOT trained (no calories) — so an
  // unchecked plan item shows the same reps as a checked one. Tick it on the
  // Training plan to count it as done.
  useEffect(() => {
    if (!exercise || today) return;
    const day = schedule[viewDay.getDay()];
    if (!day?.exerciseIds.includes(exercise.id)) return;
    const hasHistory = historyFor(workouts, exercise.id).some((w) => !isSameDay(w.at, viewDay));
    const planned = day.plans?.[exercise.id];
    if (!hasHistory && !(planned && planned.length > 0)) return;
    markExerciseDone(
      { id: exercise.id, name: exerciseName(exercise, lang), type: exercise.type, category: exercise.category },
      viewDay,
      false,
    );
  }, [exercise, today, schedule, viewDay, workouts, lang, markExerciseDone]);

  // Seed the steppers once (lazy initial state) from the last set of the most
  // recent session — where you actually left off. Seeding from the highest set
  // ever logged put a personal best from weeks ago in front of you every time,
  // which is a number to aim at, not a number to start from. The record still
  // shows as "Max" on the Training tab and as the trophy in History.
  const recent = exercise ? historyFor(workouts, exercise.id)[0] : undefined;
  const lastSet = recent?.sets[recent.sets.length - 1];
  const repsSeed = exercise && (exercise.type === 'weight_reps' || exercise.type === 'bodyweight_reps') ? 10 : 0;

  const [tab, setTab] = useState<Tab>('track');
  const [weight, setWeight] = useState(lastSet?.weightKg ?? 0);
  const [reps, setReps] = useState(lastSet?.reps ?? repsSeed);
  const [seconds, setSeconds] = useState(lastSet?.seconds ?? 0);
  const [distance, setDistance] = useState(lastSet?.distanceM ?? 0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const initialMapView =
    exercise?.primaryMuscles?.length
      ? viewForMuscles(exercise.primaryMuscles)
      : exercise
        ? viewForGroup(exercise.category)
        : null;
  const [mapView, setMapView] = useState(initialMapView);

  if (!exercise) return null;

  const type = exercise.type;

  const buildSet = (): WorkoutSet => ({
    weightKg: type === 'weight_reps' ? weight : undefined,
    reps: type === 'weight_reps' || type === 'bodyweight_reps' ? reps : undefined,
    seconds: type === 'time' || type === 'distance_time' ? seconds : undefined,
    distanceM: type === 'distance_time' ? distance : undefined,
    done: true,
    comment: note.trim() || undefined,
  });

  const primary = () => {
    successHaptic();
    if (editingIndex !== null && today) {
      updateSet(today.id, editingIndex, buildSet(), timestampFor(viewDay));
      setEditingIndex(null);
      setNote('');
    } else {
      logSet(
        { id: exercise.id, name: exerciseName(exercise, lang), type, category: exercise.category },
        buildSet(),
        timestampFor(viewDay),
      );
      useCelebrate.getState().celebrate(t('celebrate.setLogged'));
    }
  };

  const selectSet = (s: WorkoutSet, index: number) => {
    lightHaptic();
    setEditingIndex(index);
    setWeight(s.weightKg ?? 0);
    setReps(s.reps ?? 0);
    setSeconds(s.seconds ?? 0);
    setDistance(s.distanceM ?? 0);
    setNote(s.comment ?? '');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setNote('');
  };

  const deleteSet = (index: number) => {
    if (!today) return;
    removeSet(today.id, index);
    if (editingIndex === index) cancelEdit();
  };

  const deleteComment = (index: number) => {
    if (!today) return;
    updateSet(today.id, index, { comment: undefined }, timestampFor(viewDay));
    if (editingIndex === index) setNote('');
  };

  const dayLabel = isSameDay(new Date().toISOString(), viewDay)
    ? t('track.today')
    : viewDay.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Screen
      footer={
        tab === 'track' ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {editingIndex !== null && (
              <Button label={t('common.cancel')} variant="ghost" onPress={cancelEdit} style={{ flex: 1 }} />
            )}
            <Button
              label={editingIndex !== null ? t('track.saveSet') : t('track.addSet')}
              icon={editingIndex !== null ? 'checkmark' : 'add'}
              onPress={primary}
              style={{ flex: 2 }}
            />
          </View>
        ) : undefined
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[Type.title, { color: theme.text, flex: 1 }]} numberOfLines={1}>
          {exerciseName(exercise, lang)}
        </Text>
        {exercise.source !== 'builtin' && (
          <Pressable
            onPress={() => router.push(`/exercise-edit?id=${encodeURIComponent(exercise.id)}`)}
            hitSlop={10}
            style={styles.headerBtn}
          >
            <Ionicons name="create-outline" size={22} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.tag, { backgroundColor: MUSCLE_COLORS[exercise.category] + '22' }]}>
          <Text style={{ color: MUSCLE_COLORS[exercise.category], fontSize: 12, fontWeight: '700' }}>
            {t(`muscles.${exercise.category}`)}
          </Text>
        </View>
        <View style={[styles.tag, { backgroundColor: theme.cardSubtle }]}>
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
            {t(`exerciseEdit.types.${type}`)}
          </Text>
        </View>
      </View>

      {mapView && (
        <Card style={styles.muscleMapCard}>
          {exercise.primaryMuscles?.length ? (
            <BodyMap
              view={mapView}
              highlightedMuscles={exercise.primaryMuscles}
              secondaryMuscles={exercise.secondaryMuscles}
              size={110}
            />
          ) : (
            <BodyMap view={mapView} highlighted={[exercise.category]} size={110} />
          )}
          <BodyMapViewSwitch view={mapView} onChange={setMapView} />
          <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
            {t('exercises.targets')}{' '}
            {exercise.primaryMuscles?.length
              ? exercise.primaryMuscles.map((m) => t(`muscleIds.${m}`)).join(', ')
              : t(`muscles.${exercise.category}`)}
          </Text>
          {!!exercise.secondaryMuscles?.length && (
            <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '500' }}>
              {t('exercises.alsoWorks')} {exercise.secondaryMuscles.map((m) => t(`muscleIds.${m}`)).join(', ')}
            </Text>
          )}
        </Card>
      )}

      {exercise.photoUri ? (
        <Image source={{ uri: exercise.photoUri }} style={styles.photo} contentFit="cover" />
      ) : null}
      {exercise.description ? (
        <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: Spacing.md }}>
          {exercise.description}
        </Text>
      ) : null}
      <Pressable
        onPress={() => {
          const url = exercise.videoUrl?.trim();
          const query = encodeURIComponent(t('gymResult.videoQuery', { name: exerciseName(exercise, lang) }));
          Linking.openURL(url && /^https?:\/\//.test(url) ? url : `https://www.youtube.com/results?search_query=${query}`);
        }}
        style={styles.videoLink}
      >
        <Ionicons name="logo-youtube" size={18} color={theme.danger} />
        <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
          {t('gymResult.watchVideo')}
        </Text>
      </Pressable>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: theme.cardSubtle }]}>
        {(['track', 'history', 'graph'] as Tab[]).map((tb) => {
          const active = tab === tb;
          return (
            <Pressable
              key={tb}
              onPress={() => {
                lightHaptic();
                setTab(tb);
              }}
              style={[styles.tabItem, active && { backgroundColor: theme.card }, active && cardShadow(theme.shadow)]}
            >
              <Text style={{ color: active ? theme.text : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>
                {t(`track.${tb}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'track' && (
        <TrackTab
          type={type}
          weight={weight}
          reps={reps}
          seconds={seconds}
          distance={distance}
          setWeight={setWeight}
          setReps={setReps}
          setSeconds={setSeconds}
          setDistance={setDistance}
          note={note}
          setNote={setNote}
          editing={editingIndex !== null}
          dayLabel={dayLabel}
          caloriesBurned={todayCalories}
          fromWhoop={todayFromWhoop}
          sets={todaySets}
          editingIndex={editingIndex}
          onSelect={selectSet}
          onDelete={deleteSet}
          onDeleteComment={deleteComment}
        />
      )}

      {tab === 'history' && <HistoryTab sessions={history} type={type} locale={locale} />}

      {tab === 'graph' && (
        <GraphTab sessions={history} type={type} width={width - Spacing.md * 2 - Spacing.md * 2} locale={locale} />
      )}
    </Screen>
  );
}

/** Human-readable value(s) of a single set. */
function setLabel(s: WorkoutSet, type: ExerciseType, kg: string, min = 'min'): string {
  if (type === 'weight_reps') return `${s.weightKg ?? 0} ${kg} × ${s.reps ?? 0}`;
  if (type === 'bodyweight_reps') return `× ${s.reps ?? 0}`;
  if (type === 'time') return `${s.seconds ?? 0}s`;
  const parts = [`${Math.round((s.seconds ?? 0) / 60)} ${min}`];
  if (s.distanceM) parts.push(`${(s.distanceM / 1000).toFixed(1)} km`);
  return parts.join(' · ');
}

function TrackTab({
  type,
  weight,
  reps,
  seconds,
  distance,
  setWeight,
  setReps,
  setSeconds,
  setDistance,
  note,
  setNote,
  editing,
  dayLabel,
  sets,
  caloriesBurned,
  fromWhoop,
  editingIndex,
  onSelect,
  onDelete,
  onDeleteComment,
}: {
  type: ExerciseType;
  weight: number;
  reps: number;
  seconds: number;
  distance: number;
  setWeight: (n: number) => void;
  setReps: (n: number) => void;
  setSeconds: (n: number) => void;
  setDistance: (n: number) => void;
  note: string;
  setNote: (s: string) => void;
  editing: boolean;
  dayLabel: string;
  sets: WorkoutSet[];
  /** This exercise's own calories for today — WHOOP's real number when a
   * WHOOP-detected workout overlaps this session's logged time, else the
   * set/rep formula estimate (see `fromWhoop`). */
  caloriesBurned?: number;
  /** Whether `caloriesBurned` came from a matched WHOOP workout. */
  fromWhoop?: boolean;
  editingIndex: number | null;
  onSelect: (s: WorkoutSet, i: number) => void;
  onDelete: (i: number) => void;
  onDeleteComment: (i: number) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const kg = t('progress.kg');

  return (
    <View>
      <View style={[styles.dayChip, { justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
          <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{dayLabel}</Text>
        </View>
        {!!caloriesBurned && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {fromWhoop && <Ionicons name="watch-outline" size={12} color={theme.carbs} />}
            <Text style={{ color: theme.carbs, fontWeight: '700', fontSize: 13 }}>
              {caloriesBurned} {t('common.kcal')}
              {fromWhoop ? ` · ${t('track.fromWhoop')}` : ''}
            </Text>
          </View>
        )}
      </View>

      <Card>
        <View style={styles.stepperGroup}>
          {type === 'weight_reps' && (
            <>
              <Stepper label={`${t('track.weight')} (${kg})`} value={weight} onChange={setWeight} step={2.5} decimals={1} />
              <Stepper label={t('track.reps')} value={reps} onChange={setReps} step={1} />
            </>
          )}
          {type === 'bodyweight_reps' && (
            <Stepper label={t('track.reps')} value={reps} onChange={setReps} step={1} />
          )}
          {type === 'time' && (
            <Stepper label={t('track.seconds')} value={seconds} onChange={setSeconds} step={5} />
          )}
          {type === 'distance_time' && (
            <>
              <Stepper label={t('track.distance')} value={distance} onChange={setDistance} step={100} />
              {/* Cardio is counted in minutes — nobody logs a 20 minute run by
                  tapping seconds. Stored as seconds underneath, unchanged. */}
              <Stepper
                label={t('track.minutes')}
                value={Math.round(seconds / 60)}
                onChange={(m) => setSeconds(Math.round(m) * 60)}
                step={1}
              />
            </>
          )}
        </View>

        {editing && (
          <View style={[styles.noteWrap, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.textTertiary} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('track.notePlaceholder')}
              placeholderTextColor={theme.textTertiary}
              style={{ flex: 1, color: theme.text, fontSize: 14, padding: 0 }}
              maxLength={120}
            />
          </View>
        )}
      </Card>

      {sets.length === 0 ? (
        <Text style={{ color: theme.textTertiary, textAlign: 'center', marginTop: Spacing.sm }}>
          {t('training.emptyDay')}
        </Text>
      ) : (
        <Card>
          {sets.map((s, i) => {
            const active = editingIndex === i;
            const isBest = i === bestSetIndex(sets, type);
            return (
              <Pressable
                key={i}
                onPress={() => onSelect(s, i)}
                style={[
                  styles.setRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  active && { backgroundColor: theme.cardSubtle },
                ]}
              >
                <View style={[styles.setNum, { backgroundColor: theme.cardSubtle }]}>
                  <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
                      {setLabel(s, type, kg, t('track.min'))}
                    </Text>
                    {isBest && <Ionicons name="trophy" size={14} color={theme.carbs} />}
                  </View>
                  {s.comment ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text
                        style={{ color: theme.textTertiary, fontSize: 12, flexShrink: 1 }}
                        numberOfLines={1}
                      >
                        {s.comment}
                      </Text>
                      <Pressable onPress={() => onDeleteComment(i)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={13} color={theme.textTertiary} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <Pressable onPress={() => onDelete(i)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
                </Pressable>
              </Pressable>
            );
          })}
        </Card>
      )}
    </View>
  );
}

function HistoryTab({ sessions, type, locale }: { sessions: LoggedWorkout[]; type: ExerciseType; locale: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const kg = t('progress.kg');
  if (sessions.length === 0) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.border }]}>
        <Ionicons name="time-outline" size={30} color={theme.textTertiary} />
        <Text style={{ color: theme.textSecondary }}>{t('track.noHistory')}</Text>
      </View>
    );
  }
  return (
    <View>
      {sessions.map((w) => (
        <Card key={w.id}>
          <View style={styles.histHead}>
            <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>
              {isSameDay(w.at, new Date())
                ? t('track.today')
                : new Date(w.at).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}
            </Text>
            <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '600' }}>
              {t('track.setsSummary', { count: w.sets.length })}
            </Text>
          </View>
          {w.sets.map((s, i) => (
            <View key={i} style={styles.histSet}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, width: 22 }}>{i + 1}.</Text>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                {setLabel(s, type, kg, t('track.min'))}
              </Text>
              {i === bestSetIndex(w.sets, w.type) && <Ionicons name="trophy" size={13} color={theme.carbs} />}
              {type === 'weight_reps' && (s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0 ? (
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {t('track.est1rm')} {est1RM(s.weightKg ?? 0, s.reps ?? 0)}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

function GraphTab({
  sessions,
  type,
  width,
  locale,
}: {
  sessions: LoggedWorkout[];
  type: ExerciseType;
  width: number;
  locale: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  // Oldest → newest, last 8 sessions.
  const chrono = [...sessions].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(-8);
  if (chrono.length < 2) {
    return (
      <View style={[styles.emptyBox, { borderColor: theme.border }]}>
        <Ionicons name="trending-up" size={30} color={theme.textTertiary} />
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('track.noGraph')}</Text>
      </View>
    );
  }
  const values = chrono.map(sessionMetric);
  const labels = chrono.map((w) => new Date(w.at).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }));
  const unit =
    type === 'weight_reps' ? t('progress.kg') : type === 'time' ? 's' : type === 'distance_time' ? 'm' : t('track.reps');
  return (
    <Card>
      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: Spacing.sm }}>
        {t('track.best')} · {unit}
      </Text>
      <TrendLine values={values} labels={labels} color={theme.primary} width={width} unit={unit} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  headerBtn: { padding: 2 },
  metaRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  tag: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  muscleMapCard: { alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  photo: { width: '100%', height: 150, borderRadius: Radius.lg, marginBottom: Spacing.md },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  tabBar: { flexDirection: 'row', borderRadius: Radius.full, padding: 4, marginBottom: Spacing.md },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: Radius.full },
  dayChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  stepperGroup: { flexDirection: 'row', gap: Spacing.md },
  noteWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginTop: Spacing.md,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, paddingHorizontal: 4, borderRadius: Radius.sm },
  setNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  histHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  histSet: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  emptyBox: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
