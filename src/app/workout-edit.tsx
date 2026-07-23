import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Field, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { timestampFor, useViewDay } from '@/lib/day';
import { useAppStore, workoutBurnEstimate } from '@/lib/store';

export default function WorkoutEdit() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, name: nameParam, sets: setsParam, reps: repsParam } = useLocalSearchParams<{
    id?: string;
    name?: string;
    sets?: string;
    reps?: string;
  }>();

  const workouts = useAppStore((s) => s.workouts);
  const addWorkout = useAppStore((s) => s.addWorkout);
  const updateWorkout = useAppStore((s) => s.updateWorkout);
  const removeWorkout = useAppStore((s) => s.removeWorkout);
  const profile = useAppStore((s) => s.profile);
  const viewDay = useViewDay((s) => s.day);

  const existing = id ? workouts.find((w) => w.id === id) : undefined;

  const [name, setName] = useState(existing?.equipmentName ?? nameParam ?? '');
  const [sets, setSets] = useState(
    existing?.sets ? String(existing.sets) : (setsParam ?? ''),
  );
  const [reps, setReps] = useState(existing?.reps ?? repsParam ?? '');
  const [weight, setWeight] = useState(
    existing?.weightLiftedKg ? String(existing.weightLiftedKg) : '',
  );

  const save = () => {
    if (name.trim().length < 2) {
      Alert.alert(t('workoutEdit.nameRequired'));
      return;
    }
    const patch = {
      equipmentName: name.trim(),
      sets: parseInt(sets, 10) || undefined,
      reps: reps.trim() || undefined,
      weightLiftedKg: parseFloat(weight) || undefined,
    };
    if (existing) {
      updateWorkout(existing.id, patch);
    } else {
      addWorkout({
        ...patch,
        at: timestampFor(viewDay),
        caloriesBurned: profile ? workoutBurnEstimate(profile.weightKg) : undefined,
      });
    }
    router.dismissTo('/(tabs)/training');
  };

  const del = () => {
    if (existing) removeWorkout(existing.id);
    router.dismissTo('/(tabs)/training');
  };

  return (
    <Screen
      footer={
        <View>
          <Button label={t('workoutEdit.save')} onPress={save} />
          {existing ? (
            <Button
              label={t('workoutEdit.delete')}
              variant="ghost"
              onPress={del}
              style={{ marginTop: Spacing.xs }}
            />
          ) : (
            <Button
              label={t('common.cancel')}
              variant="ghost"
              onPress={() => router.back()}
              style={{ marginTop: Spacing.xs }}
            />
          )}
        </View>
      }
    >
      <Title>{existing ? t('workoutEdit.editTitle') : t('workoutEdit.addTitle')}</Title>
      <Field
        label={t('workoutEdit.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('workoutEdit.namePlaceholder')}
        maxLength={60}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label={t('workoutEdit.sets')}
            value={sets}
            onChangeText={setSets}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.flex}>
          <Field
            label={t('workoutEdit.reps')}
            value={reps}
            onChangeText={setReps}
            placeholder={t('workoutEdit.repsPlaceholder')}
            maxLength={7}
          />
        </View>
      </View>
      <Field
        label={t('workoutEdit.weight')}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        maxLength={5}
        suffix={t('progress.kg')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
});
