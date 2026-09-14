import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { weekdayLabel } from '@/components/schedule-plan-card';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plannedMealCalories } from '@/lib/store';
import type { CoachSchedulePlan, MealPlan } from '@/lib/types';

/**
 * A program's week, food and training side by side: one row per weekday
 * with the training day's title (or Rest) and that day's planned meals.
 * Tapping a day expands its meals into dishes, portions and calories. Used
 * by the program screen for both the preview and the accepted program.
 */
export function MealPlanCard({
  plan,
  schedule,
  locale,
  style,
}: {
  plan: MealPlan;
  schedule?: CoachSchedulePlan;
  locale: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [open, setOpen] = useState<number | null>(new Date().getDay());

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        cardShadow(theme.shadow),
        style,
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="restaurant" size={16} color={theme.primary} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
          {t('program.weekGlance')}
        </Text>
      </View>
      {!!plan.summary && (
        <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: Spacing.sm }}>
          {plan.summary}
        </Text>
      )}
      {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
        const day = plan.days.find((d) => d.weekday === weekday);
        const training = schedule?.days.find((d) => d.weekday === weekday);
        const kcal = day ? day.meals.reduce((sum, m) => sum + plannedMealCalories(m), 0) : 0;
        const expanded = open === weekday;
        return (
          <View key={weekday} style={[styles.day, { borderTopColor: theme.border }]}>
            <Pressable
              onPress={() => setOpen(expanded ? null : weekday)}
              style={({ pressed }) => [styles.dayHead, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                  {weekdayLabel(weekday, locale)}
                </Text>
                <View style={styles.dayMeta}>
                  <Ionicons
                    name={training ? 'barbell-outline' : 'bed-outline'}
                    size={12}
                    color={training ? theme.primary : theme.textTertiary}
                  />
                  <Text style={{ color: training ? theme.primary : theme.textTertiary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {training ? training.title || t('training.todaysWorkout') : t('program.restDay')}
                  </Text>
                  {day && (
                    <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                      {' · '}
                      {t('mealPlan.dayTotal', { kcal: Math.round(kcal) })}
                    </Text>
                  )}
                </View>
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textTertiary} />
            </Pressable>
            {!expanded && day && (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {day.meals.map((m) => m.name).join(' · ')}
              </Text>
            )}
            {expanded &&
              day?.meals.map((meal) => (
                <View key={meal.slot} style={styles.meal}>
                  <View style={styles.mealHead}>
                    <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                      {t(`home.mealTypes.${meal.slot}`)}
                    </Text>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, flex: 1 }} numberOfLines={1}>
                      {meal.name}
                    </Text>
                    <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>
                      {Math.round(plannedMealCalories(meal))}
                    </Text>
                  </View>
                  {meal.items.map((item, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
                        {item.name}
                        {item.portion ? ` · ${item.portion}` : ''}
                      </Text>
                      <Text style={{ color: theme.textTertiary, fontSize: 11 }}>
                        {`${Math.round(item.calories)} · P${Math.round(item.proteinG)} C${Math.round(item.carbsG)} F${Math.round(item.fatG)}`}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.xs },
  day: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.sm },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meal: { marginTop: Spacing.sm },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingStart: 4, marginTop: 2 },
});
