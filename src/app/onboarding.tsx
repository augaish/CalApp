import * as Updates from 'expo-updates';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, OptionRow, Screen, Subtitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applyRTL, initI18n } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';
import { dailyTargets } from '@/lib/tdee';
import type { ActivityLevel, Goal, Language, Profile, Sex } from '@/lib/types';

type Step = 'language' | 'about' | 'activity' | 'goal' | 'results';

const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOALS: Goal[] = ['lose', 'maintain', 'gain'];

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
    initI18n(lang);
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
    const a = parseInt(age, 10);
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!a || a < 10 || a > 100 || !h || h < 100 || h > 250 || !w || w < 30 || w > 300) {
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

  return (
    <Screen>
      {step === 'language' && (
        <View style={styles.center}>
          <Title>{t('onboarding.welcomeTitle')}</Title>
          <Subtitle>{t('onboarding.welcomeSubtitle')}</Subtitle>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            {t('onboarding.chooseLanguage')}
          </Text>
          <Button label="English" onPress={() => chooseLanguage('en')} style={styles.langBtn} />
          <Button label="العربية" onPress={() => chooseLanguage('ar')} style={styles.langBtn} />
        </View>
      )}

      {step === 'about' && (
        <View>
          <Title>{t('onboarding.aboutYou')}</Title>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            {t('onboarding.sex')}
          </Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <OptionRow label={t('onboarding.male')} selected={sex === 'male'} onPress={() => setSex('male')} />
            </View>
            <View style={styles.flex}>
              <OptionRow label={t('onboarding.female')} selected={sex === 'female'} onPress={() => setSex('female')} />
            </View>
          </View>
          <Field label={t('onboarding.age')} value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
          <Field label={t('onboarding.height')} value={height} onChangeText={setHeight} keyboardType="decimal-pad" maxLength={5} />
          <Field label={t('onboarding.weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={5} />
          <Button label={t('common.next')} onPress={submitAbout} />
        </View>
      )}

      {step === 'activity' && (
        <View>
          <Title>{t('onboarding.activityTitle')}</Title>
          {ACTIVITY_LEVELS.map((level) => (
            <OptionRow
              key={level}
              label={t(`onboarding.activity.${level}`)}
              description={t(`onboarding.activity.${level}Desc`)}
              selected={activity === level}
              onPress={() => setActivity(level)}
            />
          ))}
          <Button label={t('common.next')} onPress={() => setStep('goal')} style={styles.next} />
          <Button label={t('common.back')} variant="ghost" onPress={() => setStep('about')} />
        </View>
      )}

      {step === 'goal' && (
        <View>
          <Title>{t('onboarding.goalTitle')}</Title>
          {GOALS.map((g) => (
            <OptionRow
              key={g}
              label={t(`onboarding.goals.${g}`)}
              description={t(`onboarding.goals.${g}Desc`)}
              selected={goal === g}
              onPress={() => setGoal(g)}
            />
          ))}
          <Button label={t('common.next')} onPress={() => setStep('results')} style={styles.next} />
          <Button label={t('common.back')} variant="ghost" onPress={() => setStep('activity')} />
        </View>
      )}

      {step === 'results' && targets && (
        <View>
          <Title>{t('onboarding.resultsTitle')}</Title>
          <Subtitle>{t('onboarding.resultsSubtitle')}</Subtitle>
          <Card style={styles.caloriesCard}>
            <Text style={[styles.caloriesValue, { color: theme.primary }]}>{targets.calories}</Text>
            <Text style={[styles.caloriesLabel, { color: theme.textSecondary }]}>
              {t('onboarding.dailyCalories')} ({t('common.kcal')})
            </Text>
          </Card>
          <View style={styles.row}>
            <MacroPill label={t('onboarding.protein')} value={targets.proteinG} color={theme.protein} />
            <MacroPill label={t('onboarding.carbs')} value={targets.carbsG} color={theme.carbs} />
            <MacroPill label={t('onboarding.fat')} value={targets.fatG} color={theme.fat} />
          </View>
          <Button label={t('onboarding.start')} onPress={finish} style={styles.next} />
          <Button label={t('common.back')} variant="ghost" onPress={() => setStep('goal')} />
        </View>
      )}
    </Screen>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = useTheme();
  return (
    <Card style={[styles.flex, styles.macroPill]}>
      <Text style={[styles.macroValue, { color }]}>{value}g</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  sectionLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  langBtn: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  flex: { flex: 1 },
  next: { marginTop: Spacing.md, marginBottom: Spacing.sm },
  caloriesCard: { alignItems: 'center', paddingVertical: Spacing.lg },
  caloriesValue: { fontSize: 48, fontWeight: '800' },
  caloriesLabel: { fontSize: 14, marginTop: 4 },
  macroPill: { alignItems: 'center' },
  macroValue: { fontSize: 22, fontWeight: '700' },
});
