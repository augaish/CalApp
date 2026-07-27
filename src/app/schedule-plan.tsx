import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Stepper, Subtitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { exerciseName, findExercise } from '@/lib/exercises';
import { lightHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';
import type { ExerciseType, PlannedSet } from '@/lib/types';

function setLabel(s: PlannedSet, type: ExerciseType, kg: string): string {
  if (type === 'weight_reps') return `${s.weightKg ?? 0} ${kg} × ${s.reps ?? 0}`;
  if (type === 'bodyweight_reps') return `× ${s.reps ?? 0}`;
  if (type === 'time') return `${s.seconds ?? 0}s`;
  return `${s.distanceM ?? 0} m · ${s.seconds ?? 0}s`;
}

export default function SchedulePlan() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const kg = t('progress.kg');
  const { weekday, id } = useLocalSearchParams<{ weekday?: string; id?: string }>();
  const wd = Number(weekday);

  const custom = useAppStore((s) => s.exercises);
  const schedule = useAppStore((s) => s.schedule);
  const setPlannedSets = useAppStore((s) => s.setPlannedSets);

  const exercise = id ? findExercise(id, custom) : undefined;
  const type = exercise?.type ?? 'weight_reps';

  const [sets, setSets] = useState<PlannedSet[]>(() =>
    id ? (schedule[wd]?.plans?.[id] ?? []).map((s) => ({ ...s })) : [],
  );
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(type === 'weight_reps' || type === 'bodyweight_reps' ? 10 : 0);
  const [seconds, setSeconds] = useState(0);
  const [distance, setDistance] = useState(0);

  if (!exercise || !id) {
    return (
      <Screen footer={<Button label={t('common.close')} onPress={() => router.back()} />}>
        <Title>{t('schedulePlan.title')}</Title>
        <Text style={{ color: theme.textSecondary }}>{t('mealEdit.notFound')}</Text>
      </Screen>
    );
  }

  const addSet = () => {
    const next: PlannedSet = {
      weightKg: type === 'weight_reps' ? weight : undefined,
      reps: type === 'weight_reps' || type === 'bodyweight_reps' ? reps : undefined,
      seconds: type === 'time' || type === 'distance_time' ? seconds : undefined,
      distanceM: type === 'distance_time' ? distance : undefined,
    };
    lightHaptic();
    setSets((prev) => [...prev, next]);
  };

  const removeAt = (i: number) => setSets((prev) => prev.filter((_, idx) => idx !== i));

  const save = () => {
    setPlannedSets(wd, id, sets);
    router.back();
  };

  return (
    <Screen
      footer={
        <View style={{ gap: Spacing.xs }}>
          <Button label={t('schedulePlan.addSet')} icon="add" variant="secondary" onPress={addSet} />
          <Button label={t('schedulePlan.save')} onPress={save} />
        </View>
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title>{exerciseName(exercise, lang)}</Title>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Subtitle>{t('schedulePlan.hint')}</Subtitle>

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
              <Stepper label={t('track.seconds')} value={seconds} onChange={setSeconds} step={10} />
            </>
          )}
        </View>
      </Card>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {t('schedulePlan.planned', { count: sets.length })}
      </Text>
      {sets.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="list-outline" size={28} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            {t('schedulePlan.emptyHint')}
          </Text>
        </View>
      ) : (
        <Card>
          {sets.map((s, i) => (
            <View
              key={i}
              style={[
                styles.setRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              ]}
            >
              <View style={[styles.setNum, { backgroundColor: theme.cardSubtle }]}>
                <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
              </View>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15, flex: 1 }}>
                {setLabel(s, type, kg)}
              </Text>
              <Pressable onPress={() => removeAt(i)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepperGroup: { flexDirection: 'row', gap: Spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.md },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, paddingHorizontal: 4 },
  setNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
