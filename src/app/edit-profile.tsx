import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Field, OptionRow, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { normalizeDigits } from '@/lib/numbers';
import { useAppStore } from '@/lib/store';
import type { ActivityLevel, Goal, Sex } from '@/lib/types';

const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOALS: Goal[] = ['lose', 'maintain', 'gain'];

export default function EditProfile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);

  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [age, setAge] = useState(String(profile?.age ?? ''));
  const [height, setHeight] = useState(String(profile?.heightCm ?? ''));
  const [weight, setWeight] = useState(String(profile?.weightKg ?? ''));
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activityLevel ?? 'moderate');
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? 'lose');

  const save = () => {
    const a = parseInt(age, 10);
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!a || a < 10 || a > 100 || !h || h < 100 || h > 250 || !w || w < 30 || w > 300) {
      Alert.alert(t('onboarding.invalidInput'));
      return;
    }
    setProfile({ sex, age: a, heightCm: h, weightKg: w, activityLevel: activity, goal });
    if (router.canGoBack()) router.back();
  };

  return (
    <Screen footer={<Button label={t('editProfile.save')} onPress={save} />}>
      <Title>{t('editProfile.title')}</Title>
      <View style={styles.row}>
        <View style={styles.flex}>
          <OptionRow label={t('onboarding.male')} selected={sex === 'male'} onPress={() => setSex('male')} />
        </View>
        <View style={styles.flex}>
          <OptionRow label={t('onboarding.female')} selected={sex === 'female'} onPress={() => setSex('female')} />
        </View>
      </View>
      <Field label={t('onboarding.age')} value={age} onChangeText={(v) => setAge(normalizeDigits(v))} keyboardType="number-pad" maxLength={3} />
      <Field label={t('onboarding.height')} value={height} onChangeText={(v) => setHeight(normalizeDigits(v))} keyboardType="decimal-pad" maxLength={5} suffix="cm" />
      <Field label={t('onboarding.weight')} value={weight} onChangeText={(v) => setWeight(normalizeDigits(v))} keyboardType="decimal-pad" maxLength={5} suffix="kg" />

      <Text style={[styles.heading, { color: theme.text }]}>{t('onboarding.activityTitle')}</Text>
      {ACTIVITY_LEVELS.map((level) => (
        <OptionRow
          key={level}
          label={t(`onboarding.activity.${level}`)}
          selected={activity === level}
          onPress={() => setActivity(level)}
        />
      ))}

      <Text style={[styles.heading, { color: theme.text }]}>{t('onboarding.goalTitle')}</Text>
      {GOALS.map((g) => (
        <OptionRow
          key={g}
          label={t(`onboarding.goals.${g}`)}
          selected={goal === g}
          onPress={() => setGoal(g)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  flex: { flex: 1 },
  heading: { fontSize: 17, fontWeight: '700', marginTop: Spacing.sm, marginBottom: Spacing.sm },
});
