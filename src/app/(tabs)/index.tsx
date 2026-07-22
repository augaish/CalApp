import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, MacroBar, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mealCalories, isToday, todayTotals, useAppStore } from '@/lib/store';

export default function Home() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const targets = useAppStore((s) => s.targets);
  const meals = useAppStore((s) => s.meals);
  const removeMeal = useAppStore((s) => s.removeMeal);

  if (!targets) return null;

  const totals = todayTotals(meals);
  const remaining = targets.calories - totals.calories;
  const todaysMeals = meals.filter((m) => isToday(m.at));

  return (
    <Screen>
      <Title>{t('home.today')}</Title>

      <Card style={styles.heroCard}>
        <Text
          style={[
            styles.remainingValue,
            { color: remaining >= 0 ? theme.primary : theme.danger },
          ]}
        >
          {Math.abs(Math.round(remaining))}
        </Text>
        <Text style={[styles.remainingLabel, { color: theme.textSecondary }]}>
          {remaining >= 0 ? t('home.remaining') : t('home.overTarget')} ({t('common.kcal')})
        </Text>
        <Text style={[styles.targetLine, { color: theme.textSecondary }]}>
          {t('home.consumed')}: {Math.round(totals.calories)} · {t('home.target')}: {targets.calories}
        </Text>
      </Card>

      <Card>
        <View style={styles.macroRow}>
          <MacroBar label={t('home.protein')} value={totals.proteinG} target={targets.proteinG} color={theme.protein} unit={t('common.grams')} />
          <MacroBar label={t('home.carbs')} value={totals.carbsG} target={targets.carbsG} color={theme.carbs} unit={t('common.grams')} />
          <MacroBar label={t('home.fat')} value={totals.fatG} target={targets.fatG} color={theme.fat} unit={t('common.grams')} />
        </View>
      </Card>

      <View style={styles.scanRow}>
        <Button
          label={`🍽 ${t('home.scanMeal')}`}
          onPress={() => router.push('/scan?mode=meal')}
          style={styles.scanBtn}
        />
        <Button
          label={`🏋️ ${t('home.scanGym')}`}
          variant="secondary"
          onPress={() => router.push('/scan?mode=gym')}
          style={styles.scanBtn}
        />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home.todaysMeals')}</Text>
      {todaysMeals.length === 0 ? (
        <Text style={{ color: theme.textSecondary }}>{t('home.noMeals')}</Text>
      ) : (
        todaysMeals.map((meal) => (
          <Pressable key={meal.id} onLongPress={() => removeMeal(meal.id)}>
            <Card style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={1}>
                  {meal.items.map((i) => i.name).join(' · ')}
                </Text>
                <Text style={[styles.mealKcal, { color: theme.primary }]}>
                  {Math.round(mealCalories(meal))} {t('common.kcal')}
                </Text>
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {new Date(meal.at).toLocaleTimeString(i18n.language === 'ar' ? 'ar' : 'en', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: { alignItems: 'center', paddingVertical: Spacing.lg },
  remainingValue: { fontSize: 56, fontWeight: '800' },
  remainingLabel: { fontSize: 15, marginTop: 2 },
  targetLine: { fontSize: 13, marginTop: Spacing.sm },
  macroRow: { flexDirection: 'row', gap: Spacing.md },
  scanRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  scanBtn: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  mealCard: { marginBottom: Spacing.sm },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  mealName: { fontSize: 16, fontWeight: '600', flex: 1 },
  mealKcal: { fontSize: 16, fontWeight: '700' },
});
