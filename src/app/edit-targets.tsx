import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Screen, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';
import { atwater, carbsForCalories, dailyTargets } from '@/lib/tdee';

export default function EditTargets() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const targets = useAppStore((s) => s.targets);
  const profile = useAppStore((s) => s.profile);
  const setTargets = useAppStore((s) => s.setTargets);

  const [calories, setCalories] = useState(String(targets?.calories ?? ''));
  const [protein, setProtein] = useState(String(targets?.proteinG ?? ''));
  const [carbs, setCarbs] = useState(String(targets?.carbsG ?? ''));
  const [fat, setFat] = useState(String(targets?.fatG ?? ''));

  const save = () => {
    const c = parseInt(calories, 10);
    if (!c || c < 500 || c > 8000) {
      Alert.alert(t('onboarding.invalidInput'));
      return;
    }
    setTargets({
      calories: c,
      proteinG: parseInt(protein, 10) || 0,
      carbsG: parseInt(carbs, 10) || 0,
      fatG: parseInt(fat, 10) || 0,
    });
    successHaptic();
    router.back();
  };

  // What the three macro fields actually add up to, against the calorie field.
  // Nothing used to check this, so a hand-edited macro could leave the Overview
  // showing a calorie goal its own macro row disagreed with — 120/282/85 g is
  // 2373 kcal, not the 2300 next to it.
  const goalKcal = parseInt(calories, 10) || 0;
  const macroKcal = atwater(
    parseInt(protein, 10) || 0,
    parseInt(carbs, 10) || 0,
    parseInt(fat, 10) || 0,
  );
  // A few kcal is just whole-gram rounding; anything more was a real edit.
  const mismatch = goalKcal > 0 && Math.abs(macroKcal - goalKcal) > 5;

  /** Rebalance carbs so the macros hit the calorie target exactly. */
  const fixWithCarbs = () => {
    setCarbs(String(carbsForCalories(goalKcal, parseInt(protein, 10) || 0, parseInt(fat, 10) || 0)));
  };

  // Restore the values we calculated from the user's profile (live preview;
  // applied on Save).
  const resetToRecommended = () => {
    if (!profile) return;
    const rec = dailyTargets(profile);
    setCalories(String(rec.calories));
    setProtein(String(rec.proteinG));
    setCarbs(String(rec.carbsG));
    setFat(String(rec.fatG));
  };

  return (
    <Screen footer={<Button label={t('common.save')} icon="checkmark" onPress={save} />}>
      <Title>{t('editTargets.title')}</Title>

      <Field
        label={t('onboarding.dailyCalories')}
        value={calories}
        onChangeText={setCalories}
        keyboardType="number-pad"
        maxLength={5}
        suffix={t('common.kcal')}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label={t('onboarding.protein')}
            value={protein}
            onChangeText={setProtein}
            keyboardType="number-pad"
            maxLength={4}
            suffix={t('common.grams')}
          />
        </View>
        <View style={styles.flex}>
          <Field
            label={t('onboarding.carbs')}
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="number-pad"
            maxLength={4}
            suffix={t('common.grams')}
          />
        </View>
        <View style={styles.flex}>
          <Field
            label={t('onboarding.fat')}
            value={fat}
            onChangeText={setFat}
            keyboardType="number-pad"
            maxLength={4}
            suffix={t('common.grams')}
          />
        </View>
      </View>

      <View
        style={[
          styles.sumRow,
          {
            backgroundColor: mismatch ? theme.cardSubtle : 'transparent',
            borderColor: mismatch ? theme.fat : 'transparent',
          },
        ]}
      >
        <Ionicons
          name={mismatch ? 'alert-circle-outline' : 'checkmark-circle-outline'}
          size={16}
          color={mismatch ? theme.fat : theme.textTertiary}
        />
        <Text style={{ color: mismatch ? theme.text : theme.textTertiary, fontSize: 13, flex: 1 }}>
          {t('editTargets.macroSum', { kcal: macroKcal })}
          {mismatch ? ` · ${t('editTargets.macroMismatch', { kcal: goalKcal })}` : ''}
        </Text>
        {mismatch && (
          <Pressable onPress={fixWithCarbs} hitSlop={8}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
              {t('editTargets.macroFix')}
            </Text>
          </Pressable>
        )}
      </View>

      <Button
        label={t('editTargets.reset')}
        variant="secondary"
        icon="refresh"
        onPress={resetToRecommended}
      />

      <View style={styles.hintRow}>
        <Ionicons name="information-circle-outline" size={14} color={theme.textTertiary} />
        <Text style={{ color: theme.textTertiary, fontSize: 12, flex: 1 }}>{t('editTargets.hint')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.md,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
});
