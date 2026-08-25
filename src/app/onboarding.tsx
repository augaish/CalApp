import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, OptionRow, Screen, StepDots, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { normalizeDigits } from '@/lib/numbers';
import { useAppStore } from '@/lib/store';
import { dailyTargets } from '@/lib/tdee';
import type { ActivityLevel, Goal, Language, Profile, Sex } from '@/lib/types';

type Step = 'language' | 'about' | 'activity' | 'goal' | 'results';

const STEP_INDEX: Record<Step, number> = { language: 0, about: 1, activity: 2, goal: 3, results: 4 };

const ACTIVITY_LEVELS: { key: ActivityLevel; emoji: string }[] = [
  { key: 'sedentary', emoji: '🪑' },
  { key: 'light', emoji: '🚶' },
  { key: 'moderate', emoji: '🏃' },
  { key: 'active', emoji: '💪' },
  { key: 'very_active', emoji: '🔥' },
];

const GOALS: { key: Goal; emoji: string }[] = [
  { key: 'lose', emoji: '📉' },
  { key: 'maintain', emoji: '⚖️' },
  { key: 'gain', emoji: '💪' },
];

export default function Onboarding() {
  const { t } = useTranslation();
  const theme = useTheme();
  const storedLanguage = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setProfile = useAppStore((s) => s.setProfile);

  const [step, setStep] = useState<Step>(storedLanguage ? 'about' : 'language');
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<Goal>('lose');

  const chooseLanguage = async (lang: Language) => {
    setLanguage(lang);
    setI18nLanguage(lang);
    const needsReload = applyRTL(lang);
    if (needsReload) {
      try {
        await Updates.reloadAsync();
        return;
      } catch {
        // Dev / Expo Go: continue without reload; direction applies on next start.
      }
    }
    setStep('about');
  };

  const parsedProfile = (): Profile | null => {
    const a = parseInt(age, 10);
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!a || a < 10 || a > 100 || !h || h < 100 || h > 250 || !w || w < 30 || w > 300) {
      return null;
    }
    return { sex, age: a, heightCm: h, weightKg: w, activityLevel: activity, goal };
  };

  const submitAbout = () => {
    if (!parsedProfile()) {
      Alert.alert(t('onboarding.invalidInput'));
      return;
    }
    setStep('activity');
  };

  const finish = () => {
    const profile = parsedProfile();
    if (!profile) {
      setStep('about');
      return;
    }
    setProfile(profile); // flips the route guard → (tabs)
  };

  const preview = parsedProfile();
  const targets = preview ? dailyTargets(preview) : null;
  const dots = step === 'language' ? null : (
    <StepDots total={4} current={STEP_INDEX[step] - 1} />
  );

  if (step === 'language') {
    return (
      <Screen scroll={false}>
        <View style={styles.welcomeCenter}>
          <View style={[styles.welcomeBadge, { backgroundColor: theme.cardSubtle }]}>
            <Ionicons name="nutrition" size={44} color={theme.primary} />
          </View>
          <Text style={[Type.display, { color: theme.text, fontSize: 34, textAlign: 'center' }]}>
            {t('onboarding.welcomeTitle')}
          </Text>
          <Text
            style={[
              Type.body,
              { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 24 },
            ]}
          >
            {t('onboarding.welcomeSubtitle')}
          </Text>
        </View>
        <View>
          <Text style={[Type.caption, { color: theme.textTertiary, textAlign: 'center', marginBottom: Spacing.md }]}>
            {t('onboarding.chooseLanguage')}
          </Text>
          <Button label="English" onPress={() => chooseLanguage('en')} style={{ marginBottom: Spacing.sm }} />
          <Button label="العربية" onPress={() => chooseLanguage('ar')} variant="secondary" />
        </View>
      </Screen>
    );
  }

  if (step === 'about') {
    return (
      <Screen footer={<Button label={t('common.next')} onPress={submitAbout} />}>
        {dots}
        <Title>{t('onboarding.aboutYou')}</Title>
        <View style={[styles.row, { marginBottom: Spacing.md }]}>
          <View style={{ flex: 1 }}>
            <OptionRow emoji="👨" label={t('onboarding.male')} selected={sex === 'male'} onPress={() => setSex('male')} />
          </View>
          <View style={{ flex: 1 }}>
            <OptionRow emoji="👩" label={t('onboarding.female')} selected={sex === 'female'} onPress={() => setSex('female')} />
          </View>
        </View>
        <Field label={t('onboarding.age')} value={age} onChangeText={(v) => setAge(normalizeDigits(v))} keyboardType="number-pad" maxLength={3} />
        <Field label={t('onboarding.height')} value={height} onChangeText={(v) => setHeight(normalizeDigits(v))} keyboardType="decimal-pad" maxLength={5} suffix="cm" />
        <Field label={t('onboarding.weight')} value={weight} onChangeText={(v) => setWeight(normalizeDigits(v))} keyboardType="decimal-pad" maxLength={5} suffix="kg" />
      </Screen>
    );
  }

  if (step === 'activity') {
    return (
      <Screen
        footer={
          <View>
            <Button label={t('common.next')} onPress={() => setStep('goal')} />
            <Button label={t('common.back')} variant="ghost" onPress={() => setStep('about')} style={{ marginTop: Spacing.xs }} />
          </View>
        }
      >
        {dots}
        <Title>{t('onboarding.activityTitle')}</Title>
        {ACTIVITY_LEVELS.map(({ key, emoji }) => (
          <OptionRow
            key={key}
            emoji={emoji}
            label={t(`onboarding.activity.${key}`)}
            description={t(`onboarding.activity.${key}Desc`)}
            selected={activity === key}
            onPress={() => setActivity(key)}
          />
        ))}
      </Screen>
    );
  }

  if (step === 'goal') {
    return (
      <Screen
        footer={
          <View>
            <Button label={t('common.next')} onPress={() => setStep('results')} />
            <Button label={t('common.back')} variant="ghost" onPress={() => setStep('activity')} style={{ marginTop: Spacing.xs }} />
          </View>
        }
      >
        {dots}
        <Title>{t('onboarding.goalTitle')}</Title>
        {GOALS.map(({ key, emoji }) => (
          <OptionRow
            key={key}
            emoji={emoji}
            label={t(`onboarding.goals.${key}`)}
            description={t(`onboarding.goals.${key}Desc`)}
            selected={goal === key}
            onPress={() => setGoal(key)}
          />
        ))}
      </Screen>
    );
  }

  // results — the peak moment: their personal plan revealed
  return (
    <Screen
      footer={
        <View>
          <Button label={t('onboarding.start')} onPress={finish} />
          <Button label={t('common.back')} variant="ghost" onPress={() => setStep('goal')} style={{ marginTop: Spacing.xs }} />
        </View>
      }
    >
      {dots}
      <Title>{t('onboarding.resultsTitle')}</Title>
      <Subtitle>{t('onboarding.resultsSubtitle')}</Subtitle>
      {targets && (
        <>
          <View style={[styles.heroCard, { backgroundColor: theme.primary }, cardShadow(theme.shadow)]}>
            <Text style={[Type.display, { color: theme.onPrimary }]}>{targets.calories}</Text>
            <Text style={[Type.caption, { color: theme.onPrimary, opacity: 0.85 }]}>
              {t('onboarding.dailyCalories')} · {t('common.kcal')}
            </Text>
          </View>
          <View style={styles.row}>
            <MacroPill label={t('onboarding.protein')} value={targets.proteinG} color={theme.protein} />
            <MacroPill label={t('onboarding.carbs')} value={targets.carbsG} color={theme.carbs} />
            <MacroPill label={t('onboarding.fat')} value={targets.fatG} color={theme.fat} />
          </View>
        </>
      )}
    </Screen>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = useTheme();
  return (
    <Card style={styles.macroPill}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{value}g</Text>
      <Text style={[Type.caption, { color: theme.textSecondary }]}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  welcomeCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  row: { flexDirection: 'row', gap: Spacing.sm },
  heroCard: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
  },
  macroPill: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.md },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
});
