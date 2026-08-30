import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { DatePickerModal } from '@/components/date-picker';
import { GoalScenarioCards } from '@/components/goal-scenario-cards';
import { Button, Field, OptionRow, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { normalizeDigits } from '@/lib/numbers';
import { useAppStore } from '@/lib/store';
import { ageFrom, DEFAULT_PACE } from '@/lib/tdee';
import type { ActivityLevel, Goal, Sex } from '@/lib/types';

const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

/** A YYYY-MM-DD string, local time. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EditProfile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);

  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
  const [height, setHeight] = useState(String(profile?.heightCm ?? ''));
  const [weight, setWeight] = useState(String(profile?.weightKg ?? ''));
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activityLevel ?? 'moderate');
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? 'lose');
  const [paceKgPerWeek, setPaceKgPerWeek] = useState(profile?.paceKgPerWeek ?? DEFAULT_PACE[profile?.goal ?? 'lose']);

  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);
  const age = birthDate ? ageFrom(birthDate) : 0;

  const save = () => {
    if (
      !birthDate ||
      age < 10 ||
      age > 100 ||
      !heightNum ||
      heightNum < 100 ||
      heightNum > 250 ||
      !weightNum ||
      weightNum < 30 ||
      weightNum > 300
    ) {
      Alert.alert(t('onboarding.invalidInput'));
      return;
    }
    setProfile({
      sex,
      birthDate,
      heightCm: heightNum,
      weightKg: weightNum,
      activityLevel: activity,
      goal,
      paceKgPerWeek,
    });
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
      <View>
        <Field
          label={t('onboarding.birthDate')}
          value={birthDate}
          editable={false}
          placeholder="YYYY-MM-DD"
        />
        {/* A non-editable TextInput can still swallow the tap itself on some
            platforms rather than letting it bubble to a wrapping Pressable —
            an overlay guarantees the tap is actually caught. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBirthDatePicker(true)} />
      </View>
      <Field label={t('onboarding.height')} value={height} onChangeText={(v) => setHeight(normalizeDigits(v))} keyboardType="decimal-pad" maxLength={5} suffix="cm" />
      <Field label={t('onboarding.weight')} value={weight} onChangeText={(v) => setWeight(normalizeDigits(v))} keyboardType="decimal-pad" maxLength={5} suffix="kg" />
      <DatePickerModal
        visible={showBirthDatePicker}
        value={birthDate ? new Date(birthDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 25))}
        maxDate={new Date()}
        onChange={(d) => setBirthDate(ymd(d))}
        onClose={() => setShowBirthDatePicker(false)}
      />

      <Text style={[styles.heading, { color: theme.text }]}>{t('onboarding.activityTitle')}</Text>
      {ACTIVITY_LEVELS.map((level) => (
        <OptionRow
          key={level}
          label={t(`onboarding.activity.${level}`)}
          description={t(`onboarding.activity.${level}Desc`)}
          selected={activity === level}
          onPress={() => setActivity(level)}
        />
      ))}

      <Text style={[styles.heading, { color: theme.text }]}>{t('onboarding.goalTitle')}</Text>
      {heightNum > 0 && weightNum > 0 && birthDate && (
        <GoalScenarioCards
          profile={{ sex, birthDate, heightCm: heightNum, weightKg: weightNum, activityLevel: activity }}
          goal={goal}
          paceKgPerWeek={paceKgPerWeek}
          onSelect={(g, pace) => {
            setGoal(g);
            setPaceKgPerWeek(pace);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  flex: { flex: 1 },
  heading: { fontSize: 17, fontWeight: '700', marginTop: Spacing.sm, marginBottom: Spacing.sm },
});
