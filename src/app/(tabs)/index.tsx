import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, MacroTile, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
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
  const over = remaining < 0;
  const eatenPct = Math.min(1, totals.calories / targets.calories);
  const todaysMeals = meals.filter((m) => isToday(m.at));

  return (
    <Screen
      footer={
        <View style={styles.scanRow}>
          <Button
            label={`🍽 ${t('home.scanMeal')}`}
            onPress={() => router.push('/scan?mode=meal')}
            style={{ flex: 1 }}
          />
          <Button
            label={`🏋️ ${t('home.scanGym')}`}
            variant="secondary"
            onPress={() => router.push('/scan?mode=gym')}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <Title>{t('home.today')}</Title>

      {/* Hero: the one number that matters today */}
      <View style={[styles.hero, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={[Type.display, { color: over ? theme.danger : theme.text }]}>
          {Math.abs(Math.round(remaining))}
        </Text>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>
          {over ? t('home.overTarget') : t('home.remaining')} · {t('common.kcal')}
        </Text>
        <View style={[styles.heroTrack, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.heroFill,
              { backgroundColor: over ? theme.danger : theme.primary, width: `${eatenPct * 100}%` },
            ]}
          />
        </View>
        <Text style={[Type.caption, { color: theme.textTertiary, fontWeight: '400' }]}>
          {t('home.consumed')} {Math.round(totals.calories)} / {targets.calories}
        </Text>
      </View>

      <View style={styles.macroRow}>
        <MacroTile label={t('home.protein')} value={totals.proteinG} target={targets.proteinG} color={theme.protein} unit={t('common.grams')} />
        <MacroTile label={t('home.carbs')} value={totals.carbsG} target={targets.carbsG} color={theme.carbs} unit={t('common.grams')} />
        <MacroTile label={t('home.fat')} value={totals.fatG} target={targets.fatG} color={theme.fat} unit={t('common.grams')} />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home.todaysMeals')}</Text>
      {todaysMeals.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Text style={styles.emptyEmoji}>📷</Text>
          <Text style={[Type.body, { color: theme.textSecondary, textAlign: 'center', lineHeight: 23 }]}>
            {t('home.noMeals')}
          </Text>
        </View>
      ) : (
        todaysMeals.map((meal) => (
          <Pressable key={meal.id} onLongPress={() => removeMeal(meal.id)}>
            <Card style={styles.mealCard}>
              <View style={[styles.mealAvatar, { backgroundColor: theme.cardSubtle }]}>
                <Text style={{ fontSize: 22 }}>🍽</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={1}>
                  {meal.items.map((i) => i.name).join(' · ')}
                </Text>
                <Text style={[Type.caption, { color: theme.textTertiary, fontWeight: '400' }]}>
                  {new Date(meal.at).toLocaleTimeString(i18n.language === 'ar' ? 'ar' : 'en', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Text style={[styles.mealKcal, { color: theme.primary }]}>
                {Math.round(mealCalories(meal))}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: 4,
  },
  heroTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'stretch',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  heroFill: { height: 8, borderRadius: 4 },
  macroRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  scanRow: { flexDirection: 'row', gap: Spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyEmoji: { fontSize: 40 },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
    paddingVertical: 12,
  },
  mealAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  mealKcal: { fontSize: 17, fontWeight: '800' },
});
