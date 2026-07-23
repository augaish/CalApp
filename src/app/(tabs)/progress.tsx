import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TrendLine, WeekBars } from '@/components/charts';
import { Button, Card, Field, Screen, Title } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  streakDays,
  totalsForDay,
  useAppStore,
  waterForDay,
  waterTargetMl,
} from '@/lib/store';

function lastSevenDays(): Date[] {
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

export default function Progress() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const profile = useAppStore((s) => s.profile);
  const targets = useAppStore((s) => s.targets);
  const meals = useAppStore((s) => s.meals);
  const water = useAppStore((s) => s.water);
  const weights = useAppStore((s) => s.weights);
  const workouts = useAppStore((s) => s.workouts);
  const logWeight = useAppStore((s) => s.logWeight);

  const [kg, setKg] = useState('');

  if (!profile || !targets) return null;

  const days = lastSevenDays();
  const labels = days.map((d) => d.toLocaleDateString(locale, { weekday: 'narrow' }));
  const calValues = days.map((d) => Math.round(totalsForDay(meals, d).calories));
  const waterValues = days.map((d) => waterForDay(water, d));
  const weightSeries = [...weights].reverse().map((w) => w.kg);
  const streak = streakDays(meals);
  const recentWorkouts = workouts.slice(0, 5);

  const submitWeight = () => {
    const value = parseFloat(kg);
    if (!value || value < 30 || value > 300) {
      Alert.alert(t('onboarding.invalidInput'));
      return;
    }
    logWeight(value);
    setKg('');
  };

  return (
    <Screen>
      <Title>{t('progress.title')}</Title>

      <Card style={styles.streakCard}>
        <Ionicons name="flame" size={28} color={theme.carbs} />
        <Text style={[Type.title, { color: theme.text }]}>{streak}</Text>
        <Text style={{ color: theme.textSecondary }}>{t('progress.dayStreak')}</Text>
      </Card>

      <Card>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.calories7d')}</Text>
        <WeekBars values={calValues} target={targets.calories} labels={labels} color={theme.primary} />
      </Card>

      <Card>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.water7d')}</Text>
        <WeekBars
          values={waterValues}
          target={waterTargetMl(profile.weightKg)}
          labels={labels}
          color={theme.water}
        />
      </Card>

      <Card>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.weight')}</Text>
        {weightSeries.length >= 2 ? (
          <TrendLine values={weightSeries} color={theme.primary} width={width - Spacing.md * 4} />
        ) : (
          <Text style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
            {t('progress.noWeights')}
          </Text>
        )}
        {weights[0] && (
          <Text style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
            {weights[0].kg} {t('progress.kg')} ·{' '}
            {new Date(weights[0].at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
        )}
        <View style={styles.weightRow}>
          <View style={{ flex: 1 }}>
            <Field
              label={t('progress.logWeight')}
              value={kg}
              onChangeText={setKg}
              keyboardType="decimal-pad"
              maxLength={5}
              suffix={t('progress.kg')}
            />
          </View>
          <Button label="+" onPress={submitWeight} style={styles.weightBtn} />
        </View>
      </Card>

      <Card>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.workouts')}</Text>
        {recentWorkouts.length === 0 ? (
          <Text style={{ color: theme.textSecondary }}>{t('progress.noWorkouts')}</Text>
        ) : (
          recentWorkouts.map((w) => (
            <View key={w.id} style={styles.workoutRow}>
              <Ionicons name="barbell" size={18} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                  {w.equipmentName}
                </Text>
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {new Date(w.at).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                  })}
                  {w.sets ? ` · ${w.sets} × ${w.reps}` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.md },
  weightRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  weightBtn: { minWidth: 54, marginBottom: Spacing.md },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
  },
});
