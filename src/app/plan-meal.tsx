import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { illustrationFor, PhotoFallback } from '@/components/photo-fallback';
import { weekdayLabel } from '@/components/schedule-plan-card';
import { Chip, DeltaRows, IconTile } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { perServing, roundMacros, scaleMacros, servingCountLabel, servingPluralCount, SERVING_STEPS } from '@/lib/recipes';
import { dateKey, plannedMealCalories, plannedMealFor, useAppStore } from '@/lib/store';
import type { MealType } from '@/lib/types';
import { ensureRecipeInStore, useAllRecipes } from '@/lib/use-recipes';

const MEAL_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** The next seven days, starting today. Module-level so the clock is never read during render. */
function upcomingDays(): Date[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

/**
 * S14 Plan replacement preview — old and new dish, the signed change, the
 * planned day before → after, the date and the scope. Nothing is written
 * until Apply; a programme that changes underneath invalidates the preview
 * rather than landing the override on a meal nobody reviewed (AT15).
 */
export default function PlanMeal() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string; day?: string; slot?: string }>();

  const recipes = useAllRecipes();
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
  const [slot, setSlot] = useState<MealType>(MEAL_SLOTS.includes(params.slot as MealType) ? (params.slot as MealType) : 'lunch');
  const [servings, setServings] = useState(1);
  // The programme this preview was built against (S14/AT15).
  const [programAtOpen] = useState(activeProgram?.id);

  if (!recipe) return null;

  const day = days[dayIndex];
  const key = dateKey(day);
  const num = (n: number) => Math.round(n).toLocaleString(locale);

  // What the plan says for this slot right now. Untouched until Apply.
  const current = plannedMealFor(activeProgram?.mealPlan, day, slot, mealPlanSwaps, mealPlanRecipes, recipes, activeProgram?.id);
  const currentRecipe = current?.items[0]?.recipeId ? recipes.find((r) => r.id === current.items[0].recipeId) : undefined;
  const currentKcal = current ? Math.round(plannedMealCalories(current)) : 0;
  const next = roundMacros(scaleMacros(perServing(recipe), servings));
  const delta = next.calories - currentKcal;
  const portionLabel = `${servingCountLabel(servings)} ${t('recipe.servingUnit', { count: servingPluralCount(servings) })}`;

  // The whole planned day, before and after — what a person budgets against.
  const dayPlanned = MEAL_SLOTS.reduce((sum, sl) => {
    const m = plannedMealFor(activeProgram?.mealPlan, day, sl, mealPlanSwaps, mealPlanRecipes, recipes, activeProgram?.id);
    return sum + (m ? plannedMealCalories(m) : 0);
  }, 0);
  const dayAfter = dayPlanned - currentKcal + next.calories;
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

  const apply = () => {
    if (activeProgram?.id !== programAtOpen) {
      Alert.alert(t('planMeal.staleTitle'), t('planMeal.staleBody'), [{ text: t('common.close'), onPress: () => router.back() }]);
      return;
    }
    // A starter recipe becomes a private copy the moment it is planned.
    ensureRecipeInStore(recipe.id, locale);
    setPlannedRecipe(key, slot, { recipeId: recipe.id, servings });
    successHaptic();
    router.back();
  };

  const dateLabel = `${t(`home.mealTypes.${slot}`)} · ${day.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;

  return (
    <Screen
      header={<PageHeader title={t('planMeal.reviewChange')} variant="plain" />}
      footer={
        <View style={{ gap: Spacing.xs }}>
          <Button label={t('planMeal.applyChange')} onPress={apply} />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
        </View>
      }
    >
      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }}>{dateLabel}</Text>

        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.ms, marginBottom: 6 }]}>{t('planMeal.day')}</Text>
        <View style={styles.chips}>
          {days.map((d, i) => (
            <Chip key={dateKey(d)} label={i === 0 ? t('home.today') : weekdayLabel(d.getDay(), locale)} selected={i === dayIndex} onPress={() => { lightHaptic(); setDayIndex(i); }} />
          ))}
        </View>
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.ms, marginBottom: 6 }]}>{t('planMeal.slot')}</Text>
        <View style={styles.chips}>
          {MEAL_SLOTS.map((s) => (
            <Chip key={s} label={t(`home.mealTypes.${s}`)} selected={slot === s} onPress={() => { lightHaptic(); setSlot(s); }} />
          ))}
        </View>

        {/* Before */}
        <Text style={{ color: theme.text, fontWeight: '700', marginTop: Spacing.md, marginBottom: 6 }}>
          {t('planMeal.before')} <Text style={{ color: theme.textSecondary, fontWeight: '500' }}>{t('planMeal.beforePlanned')}</Text>
        </Text>
        <View style={[styles.dish, { backgroundColor: theme.surfaceTint }]}>
          {current ? (
            <PhotoFallback uri={currentRecipe?.photoUri} illustration={illustrationFor(current.name)} size={56} />
          ) : (
            <IconTile icon="restaurant-outline" size={56} color={theme.textTertiary} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>
              {current ? current.name : t('planMeal.nothingPlanned')}
            </Text>
            {current && (
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {num(currentKcal)} {t('common.kcal')}
              </Text>
            )}
          </View>
          {currentRecipe && (
            <Pressable onPress={() => router.push(`/recipe?id=${encodeURIComponent(currentRecipe.id)}`)} hitSlop={8} accessibilityRole="button" accessibilityLabel={currentRecipe.name}>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </Pressable>
          )}
        </View>
        <View style={{ alignItems: 'center', marginVertical: 4 }}>
          <Ionicons name="arrow-down" size={18} color={theme.primary} />
        </View>
        {/* After */}
        <Text style={{ color: theme.text, fontWeight: '700', marginBottom: 6 }}>
          {t('planMeal.after')} <Text style={{ color: theme.textSecondary, fontWeight: '500' }}>{t('planMeal.afterNew')}</Text>
        </Text>
        <View style={[styles.dish, { backgroundColor: theme.surfaceTint, borderWidth: 1, borderColor: theme.primary }]}>
          <PhotoFallback uri={recipe.photoUri} illustration={illustrationFor(recipe.name)} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>
              {recipe.name}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {portionLabel} · {num(next.calories)} {t('common.kcal')}
            </Text>
          </View>
        </View>
        <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.ms, marginBottom: 6 }]}>{t('planMeal.portion')}</Text>
        <View style={styles.chips}>
          {SERVING_STEPS.map((p) => (
            <Chip key={p} label={servingCountLabel(p)} selected={servings === p} onPress={() => { lightHaptic(); setServings(p); }} />
          ))}
        </View>
      </View>

      <DeltaRows
        rows={[
          { label: t('planMeal.difference'), value: `${sign(delta)}${num(Math.abs(delta))} ${t('common.kcal')}`, emphasis: true },
          { label: t('planMeal.plannedDayLabel'), value: t('planMeal.plannedDayValue', { before: num(dayPlanned), after: num(dayAfter) }) },
          { label: t('home.protein'), value: `${sign(next.proteinG - (current ? Math.round(current.items.reduce((s, i) => s + i.proteinG, 0)) : 0))}${Math.abs(next.proteinG - (current ? Math.round(current.items.reduce((s, i) => s + i.proteinG, 0)) : 0))} ${t('common.grams')}` },
          { label: t('planMeal.source'), value: activeProgram ? t('program.title') : t('today.myPlan') },
        ]}
        note={t('planMeal.thisDayOnly')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dish: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.control, padding: Spacing.ms },
});
