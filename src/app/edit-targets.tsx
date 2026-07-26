import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';
import { dailyTargets } from '@/lib/tdee';

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
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md },
});
