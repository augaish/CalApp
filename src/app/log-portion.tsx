import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PhotoFallback } from '@/components/photo-fallback';
import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { dayFromKey, timestampFor } from '@/lib/day';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import {
  foodItemForServings,
  isEstimated,
  perServing,
  roundMacros,
  scaleMacros,
  servingCountLabel,
  servingPluralCount,
  SERVING_STEPS,
  unknownNutritionCount,
} from '@/lib/recipes';
import { dateKey, mealTypeForNow, useAppStore } from '@/lib/store';
import type { MealType } from '@/lib/types';

const MEAL_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * "I ate" — the review before a diary write (S13).
 *
 * How much you cooked lives on the recipe screen; how much you ate lives
 * here, with the meal and the date stated before anything is saved. The
 * preview is computed from unrounded per-serving values, the entry stores a
 * snapshot and its basis, and a second tap on Add cannot create a second
 * entry. Undo removes exactly the entry this screen made.
 */
export default function LogPortion() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string; slot?: string; day?: string }>();

  const recipes = useAppStore((s) => s.recipes);
  const meals = useAppStore((s) => s.meals);
  const logMeal = useAppStore((s) => s.logMeal);
  const removeMeal = useAppStore((s) => s.removeMeal);
  const updateRecipe = useAppStore((s) => s.updateRecipe);

  const recipe = recipes.find((r) => r.id === params.recipeId);
  const day = params.day ? dayFromKey(params.day) : new Date();
  const isToday = dateKey(day) === dateKey(new Date());

  const [portion, setPortion] = useState<(typeof SERVING_STEPS)[number]>(1);
  const [slot, setSlot] = useState<MealType>(
    MEAL_SLOTS.includes(params.slot as MealType) ? (params.slot as MealType) : mealTypeForNow(),
  );
  const [loggedId, setLoggedId] = useState<string | null>(null);

  if (!recipe) return null;

  const mine = roundMacros(scaleMacros(perServing(recipe), portion));
  const unknown = unknownNutritionCount(recipe);
  const portionLabel = (n: number) =>
    `${servingCountLabel(n)} ${t('recipe.servingUnit', { count: servingPluralCount(n) })}`;
  const dayLabel = isToday ? t('home.today') : day.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const loggedMeal = loggedId ? meals.find((m) => m.id === loggedId) : undefined;

  const stepIndex = Math.max(0, SERVING_STEPS.indexOf(portion));
  const step = (d: number) => {
    const next = SERVING_STEPS[Math.min(SERVING_STEPS.length - 1, Math.max(0, stepIndex + d))];
    if (next !== portion) {
      lightHaptic();
      setPortion(next);
    }
  };

  const add = () => {
    if (loggedMeal) return; // idempotent: already in the diary, Undo first
    const item = foodItemForServings(recipe, portion, portionLabel(portion));
    logMeal([item], undefined, slot, timestampFor(day));
    const newest = useAppStore.getState().meals[0];
    setLoggedId(newest?.id ?? null);
    updateRecipe(recipe.id, { lastCookedAt: new Date().toISOString() });
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.mealLogged'));
  };

  const undo = () => {
    if (!loggedId) return;
    removeMeal(loggedId);
    setLoggedId(null);
    lightHaptic();
  };

  return (
    <Screen
      footer={
        loggedMeal ? (
          <View style={{ gap: Spacing.xs }}>
            <View style={[styles.loggedBar, { backgroundColor: theme.cardSubtle, borderColor: theme.border }]}>
              <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>
                {t('logPortion.added', { slot: t(`home.mealTypes.${slot}`), portion: portionLabel(portion), day: dayLabel })}
              </Text>
              <Pressable onPress={undo} hitSlop={8} accessibilityRole="button">
                <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('recipe.undo')}</Text>
              </Pressable>
            </View>
            <Button label={t('common.done')} onPress={() => router.back()} />
          </View>
        ) : (
          <View style={{ gap: Spacing.xs }}>
            <Button label={t('logPortion.addTo', { slot: t(`home.mealTypes.${slot}`) })} icon="add" onPress={add} />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
          </View>
        )
      }
    >
      <Title>{t('logPortion.title')}</Title>

      <Card>
        <Text style={[Type.caption, { color: theme.textTertiary, textTransform: 'uppercase' }]}>
          {t(`home.mealTypes.${slot}`)} · {dayLabel}
        </Text>
        <View style={styles.head}>
          <PhotoFallback uri={recipe.photoUri} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }} numberOfLines={2}>
              {recipe.name}
            </Text>
            {isEstimated(recipe) && (
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('recipe.estimated')}</Text>
            )}
            {unknown > 0 && (
              <Text style={{ color: theme.warning, fontSize: 12 }}>{t('recipeEdit.unknownNote', { n: unknown })}</Text>
            )}
          </View>
        </View>

        <View style={styles.macros}>
          <Text style={[styles.big, { color: theme.text }]}>
            {mine.calories} <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}>{t('common.kcal')}</Text>
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {t('recipe.portionMacros', { kcal: mine.calories, protein: mine.proteinG, carbs: mine.carbsG, fat: mine.fatG })}
          </Text>
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
            {t('logPortion.batchNote', { count: recipe.servings })}
          </Text>
        </View>
      </Card>

      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>{t('logPortion.iAte')}</Text>
      <Card>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => step(-1)}
            disabled={stepIndex === 0 || !!loggedMeal}
            accessibilityRole="button"
            accessibilityLabel={t('logPortion.less')}
            style={[styles.stepBtn, { backgroundColor: theme.cardSubtle }, stepIndex === 0 && { opacity: 0.4 }]}
          >
            <Ionicons name="remove" size={22} color={theme.primary} />
          </Pressable>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20, flex: 1, textAlign: 'center' }}>
            {portionLabel(portion)}
          </Text>
          <Pressable
            onPress={() => step(1)}
            disabled={stepIndex === SERVING_STEPS.length - 1 || !!loggedMeal}
            accessibilityRole="button"
            accessibilityLabel={t('logPortion.more')}
            style={[styles.stepBtn, { backgroundColor: theme.cardSubtle }, stepIndex === SERVING_STEPS.length - 1 && { opacity: 0.4 }]}
          >
            <Ionicons name="add" size={22} color={theme.primary} />
          </Pressable>
        </View>
        {/* Cooked-weight logging needs a measured batch weight first; the
            estimate alone cannot enable it (S13/AT13). Said, not hidden. */}
        <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>
          {recipe.cookedYieldMeasured ? t('logPortion.cookedWeightSoon') : t('logPortion.cookedWeightNeedsMeasured')}
        </Text>
      </Card>

      {!loggedMeal && (
        <>
          <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>{t('planMeal.slot')}</Text>
          <View style={styles.chips}>
            {MEAL_SLOTS.map((s) => {
              const on = slot === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSlot(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, { backgroundColor: on ? theme.primary : theme.cardSubtle, borderColor: on ? theme.primary : theme.border }]}
                >
                  <Text style={{ color: on ? theme.onPrimary : theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
                    {t(`home.mealTypes.${s}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', marginTop: 6 },
  macros: { marginTop: Spacing.md, gap: 2 },
  big: { fontSize: 30, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  loggedBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
});
