import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { weekdayLabel } from '@/components/schedule-plan-card';
import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { perServing, roundMacros, scaleMacros, servingCountLabel, servingPluralCount, SERVING_STEPS } from '@/lib/recipes';
import {
  dateKey,
  plannedMealCalories,
  plannedMealFor,
  useAppStore,
} from '@/lib/store';
import type { MealType } from '@/lib/types';

const MEAL_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** The next seven days, starting today — the window a plan change is worth
 * making in. Module-level so the clock is never read during render. */
function upcomingDays(): Date[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

/**
 * Put a recipe on one planned meal, showing exactly what changes first.
 *
 * Nothing is written until Apply. Replacing a 620 kcal lunch with a 710 kcal
 * recipe says so, and says so before the fact — a plan that silently keeps
 * the old number is worse than one that never changed. Only the chosen date
 * is touched; the saved recipe and every other day are left alone.
 */
export default function PlanMeal() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string; day?: string; slot?: string }>();

  const recipes = useAppStore((s) => s.recipes);
  const activeProgram = useAppStore((s) => s.activeProgram);
  const mealPlanSwaps = useAppStore((s) => s.mealPlanSwaps);
  const mealPlanRecipes = useAppStore((s) => s.mealPlanRecipes);
  const setPlannedRecipe = useAppStore((s) => s.setPlannedRecipe);

  const [days] = useState(upcomingDays);
  const recipe = recipes.find((r) => r.id === params.recipeId);

  const [dayIndex, setDayIndex] = useState(() => {
    if (!params.day) return 0;
    const i = days.findIndex((d) => dateKey(d) === params.day);
    return i >= 0 ? i : 0;
  });
  const [slot, setSlot] = useState<MealType>(
    MEAL_SLOTS.includes(params.slot as MealType) ? (params.slot as MealType) : 'lunch',
  );
  const [servings, setServings] = useState(1);

  if (!recipe) return null;

  const day = days[dayIndex];
  const key = dateKey(day);

  // What the plan says for this slot right now — programme meal, an earlier
  // swap, or a recipe already applied. Untouched until Apply.
  const current = plannedMealFor(
    activeProgram?.mealPlan,
    day,
    slot,
    mealPlanSwaps,
    mealPlanRecipes,
    recipes,
    activeProgram?.id,
  );
  const currentKcal = current ? Math.round(plannedMealCalories(current)) : 0;
  const next = roundMacros(scaleMacros(perServing(recipe), servings));
  const delta = next.calories - currentKcal;

  const portionLabel = `${servingCountLabel(servings)} ${t('recipe.servingUnit', {
    count: servingPluralCount(servings),
  })}`;

  const apply = () => {
    setPlannedRecipe(key, slot, { recipeId: recipe.id, servings });
    successHaptic();
    router.back();
  };

  return (
    <Screen footer={<Button label={t('planMeal.apply')} icon="checkmark" onPress={apply} />}>
      <Title>{t('planMeal.title')}</Title>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
        {t('planMeal.subtitle', { name: recipe.name })}
      </Text>

      {/* Which day */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>
        {t('planMeal.day')}
      </Text>
      <View style={styles.chips}>
        {days.map((d, i) => {
          const active = i === dayIndex;
          return (
            <Pressable
              key={dateKey(d)}
              onPress={() => {
                lightHaptic();
                setDayIndex(i);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.primary : theme.cardSubtle,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
                {i === 0 ? t('home.today') : weekdayLabel(d.getDay(), locale)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Which meal */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('planMeal.slot')}
      </Text>
      <View style={styles.chips}>
        {MEAL_SLOTS.map((s) => {
          const active = slot === s;
          return (
            <Pressable
              key={s}
              onPress={() => {
                lightHaptic();
                setSlot(s);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.primary : theme.cardSubtle,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
                {t(`home.mealTypes.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* How much of it counts as this meal */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('planMeal.portion')}
      </Text>
      <View style={styles.chips}>
        {SERVING_STEPS.map((p) => {
          const active = servings === p;
          return (
            <Pressable
              key={p}
              onPress={() => {
                lightHaptic();
                setServings(p);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.primary : theme.cardSubtle,
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>
                {servingCountLabel(p)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* What changes — before the fact, not after. */}
      <Card style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>
          {t('planMeal.changesTo', {
            slot: t(`home.mealTypes.${slot}`),
            kcal: next.calories,
          })}
          {current ? ` · ${delta >= 0 ? '+' : ''}${delta} ${t('common.kcal')}` : ''}
        </Text>
        {current ? (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {t('planMeal.replacing', { name: current.name, kcal: currentKcal })}
          </Text>
        ) : (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('planMeal.nothingPlanned')}</Text>
        )}
        <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('planMeal.dailyTotalNote')}</Text>
        <View style={[styles.macros, { borderTopColor: theme.border }]}>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {portionLabel} · {next.proteinG}
            {t('common.grams')} {t('home.protein')} · {next.carbsG}
            {t('common.grams')} {t('home.carbs')} · {next.fatG}
            {t('common.grams')} {t('home.fat')}
          </Text>
        </View>
        <View style={styles.scopeNote}>
          <Ionicons name="calendar-outline" size={14} color={theme.textTertiary} />
          <Text style={{ color: theme.textTertiary, fontSize: 12, flex: 1 }}>
            {t('planMeal.thisDayOnly')}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  macros: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm },
  scopeNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
