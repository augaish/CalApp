import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useViewDay } from '@/lib/day';
import { isSameDay, mealCalories, totalsForDay, useAppStore } from '@/lib/store';
import type { LoggedMeal, MealType } from '@/lib/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function Food() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const meals = useAppStore((s) => s.meals);
  const targets = useAppStore((s) => s.targets);
  const removeMeal = useAppStore((s) => s.removeMeal);
  const selected = useViewDay((s) => s.day);
  const shift = useViewDay((s) => s.shift);

  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const dayMeals = meals.filter((m) => isSameDay(m.at, selected));
  const totals = totalsForDay(meals, selected);

  const mealsOfType = (type: MealType): LoggedMeal[] =>
    dayMeals.filter((m) => (m.mealType ?? 'snack') === type);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('tabs.food')}</Text>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push('/calendar')} hitSlop={6}>
          <Text style={[styles.dayLabel, { color: theme.text }]}>
            {selectedIsToday
              ? t('home.today')
              : selected.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
        </Pressable>
        <Pressable onPress={() => shift(1)} hitSlop={10} disabled={selectedIsToday} style={styles.arrow}>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={selectedIsToday ? theme.border : theme.textSecondary}
          />
        </Pressable>
      </View>

      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
        {t('home.eaten')}:{' '}
        <Text style={{ color: theme.primary, fontWeight: '800' }}>
          {Math.round(totals.calories)}
        </Text>
        {targets ? ` / ${targets.calories} ${t('common.kcal')}` : ''}
      </Text>

      {dayMeals.length === 0 && (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="camera-outline" size={36} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            {t('home.noMeals')}
          </Text>
        </View>
      )}

      {MEAL_TYPES.map((type) => {
        const sectionMeals = mealsOfType(type);
        const sectionKcal = sectionMeals.reduce((sum, m) => sum + mealCalories(m), 0);
        return (
          <Card key={type}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionName, { color: theme.text }]}>
                {t(`home.mealTypes.${type}`)}
              </Text>
              {sectionKcal > 0 && (
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>
                  {Math.round(sectionKcal)} {t('common.kcal')}
                </Text>
              )}
              <Pressable
                onPress={() => router.push('/add-menu?scope=food')}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.sectionAdd,
                  { backgroundColor: theme.cardSubtle },
                  pressed && { transform: [{ scale: 0.9 }] },
                ]}
              >
                <Ionicons name="add" size={18} color={theme.primary} />
              </Pressable>
            </View>
            {sectionMeals.map((meal) => (
              <Pressable key={meal.id} onLongPress={() => removeMeal(meal.id)}>
                <View style={styles.mealRow}>
                  <View style={[styles.mealAvatar, { backgroundColor: theme.cardSubtle }]}>
                    <Ionicons name="restaurant" size={16} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={1}>
                      {meal.items.map((i) => i.name).join(' · ')}
                    </Text>
                    <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                      {new Date(meal.at).toLocaleTimeString(locale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.mealKcal, { color: theme.primary }]}>
                    {Math.round(mealCalories(meal))}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  arrow: { padding: 4 },
  dayLabel: { fontSize: 15, fontWeight: '700', minWidth: 64, textAlign: 'center' },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionName: { flex: 1, fontSize: 17, fontWeight: '700' },
  sectionAdd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  mealAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  mealKcal: { fontSize: 17, fontWeight: '800' },
});
