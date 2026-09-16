import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { successHaptic, lightHaptic } from '@/lib/feedback';
import {
  foodItemForServings,
  ingredientAmountLabel,
  isEstimated,
  perServing,
  roundMacros,
  scaleMacros,
  scaledIngredients,
  servingCountLabel,
  SERVING_STEPS,
} from '@/lib/recipes';
import { useAppStore } from '@/lib/store';
import type { MealType } from '@/lib/types';

const MEAL_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Which meal a given hour most likely belongs to — only a default; the
 * chips below let it be changed before logging. */
function slotForHour(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

/** Module-level: the React Compiler's purity rule forbids reading the clock
 * inside a component or a handler declared in one. */
function currentSlot(): MealType {
  return slotForHour(new Date().getHours());
}

/**
 * One recipe, in the order it is actually used: what it is, what a serving
 * costs you, how much you are cooking, what to buy, what to do, then the
 * action.
 *
 * The two quantities are deliberately separate and never linked. "Cooking
 * for" changes the pan and the shopping; "My portion" changes the diary.
 * Cooking for four must never log four, which is the single easiest thing
 * for a recipe screen to get wrong.
 */
export default function RecipeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const recipes = useAppStore((s) => s.recipes);
  const meals = useAppStore((s) => s.meals);
  const logMeal = useAppStore((s) => s.logMeal);
  const removeMeal = useAppStore((s) => s.removeMeal);

  const recipe = recipes.find((r) => r.id === id);

  const [cookingFor, setCookingFor] = useState(recipe?.servings ?? 2);
  const [portion, setPortion] = useState(1);
  const [slot, setSlot] = useState<MealType>(currentSlot);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [showTotals, setShowTotals] = useState(false);
  // The id of the meal this screen just logged, so it can be undone and so a
  // second tap cannot quietly create a duplicate entry.
  const [loggedId, setLoggedId] = useState<string | null>(null);

  if (!recipe) return null;

  const serving = roundMacros(perServing(recipe));
  const batch = roundMacros(scaleMacros(perServing(recipe), cookingFor));
  const mine = roundMacros(scaleMacros(perServing(recipe), portion));
  const ingredients = scaledIngredients(recipe, cookingFor);
  const estimated = isEstimated(recipe);

  // Still counts as logged only while that meal actually exists — deleting it
  // from the diary elsewhere should bring this screen back to "not logged".
  const loggedMeal = loggedId ? meals.find((m) => m.id === loggedId) : undefined;

  const logIt = () => {
    if (loggedMeal) return; // already in the diary; Undo first
    const item = foodItemForServings(recipe, portion, portionLabel(portion));
    logMeal([item], undefined, slot);
    // logMeal prepends, so the new meal is the newest one for this slot.
    const newest = useAppStore.getState().meals[0];
    setLoggedId(newest?.id ?? null);
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.mealLogged'));
  };

  const undo = () => {
    if (!loggedId) return;
    removeMeal(loggedId);
    setLoggedId(null);
    lightHaptic();
  };

  const portionLabel = (servings: number) =>
    `${servingCountLabel(servings)} ${t('recipe.servingUnit', { count: servings })}`;

  const remove = () => {
    Alert.alert(t('recipe.deleteTitle'), t('recipe.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          useAppStore.getState().removeRecipe(recipe.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen
      footer={
        loggedMeal ? (
          <View style={[styles.loggedBar, { backgroundColor: theme.cardSubtle, borderColor: theme.border }]}>
            <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
            <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>
              {t('recipe.addedTo', { slot: t(`home.mealTypes.${slot}`), portion: portionLabel(portion) })}
            </Text>
            <Pressable onPress={undo} hitSlop={8}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('recipe.undo')}</Text>
            </Pressable>
          </View>
        ) : (
          <Button label={t('recipe.logEaten', { portion: portionLabel(portion) })} icon="add" onPress={logIt} />
        )
      }
    >
      {/* 1. What it is */}
      <Title>{recipe.name}</Title>
      <View style={styles.metaRow}>
        {!!recipe.prepMinutes && (
          <Meta icon="time-outline" label={t('recipe.prep', { n: recipe.prepMinutes })} theme={theme} />
        )}
        {!!recipe.cookMinutes && (
          <Meta icon="flame-outline" label={t('recipe.cook', { n: recipe.cookMinutes })} theme={theme} />
        )}
        <Meta icon="people-outline" label={t('recipes.servingsCount', { count: recipe.servings })} theme={theme} />
      </View>

      {/* 2. What a serving costs you — the number people actually eat. */}
      <Card style={{ gap: Spacing.sm }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('recipe.perServing')}</Text>
        <View style={styles.macroRow}>
          <Macro value={`${serving.calories}`} label={t('common.kcal')} theme={theme} big />
          <Macro value={`${serving.proteinG}${t('common.grams')}`} label={t('home.protein')} theme={theme} />
          <Macro value={`${serving.carbsG}${t('common.grams')}`} label={t('home.carbs')} theme={theme} />
          <Macro value={`${serving.fatG}${t('common.grams')}`} label={t('home.fat')} theme={theme} />
        </View>
        {estimated && (
          // Exact arithmetic over estimated ingredients is still an estimate.
          // Saying so is cheaper than implying a precision we do not have.
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('recipe.estimated')}</Text>
        )}
        <Pressable onPress={() => setShowTotals((v) => !v)} hitSlop={8}>
          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>
            {showTotals ? t('recipe.hideTotals') : t('recipe.showTotals')}
          </Text>
        </Pressable>
        {showTotals && (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            {t('recipe.batchTotals', {
              servings: cookingFor,
              kcal: batch.calories,
              protein: batch.proteinG,
              carbs: batch.carbsG,
              fat: batch.fatG,
            })}
          </Text>
        )}
      </Card>

      {/* 3. How much you are cooking — the pan and the shopping, nothing else. */}
      <Card style={{ gap: Spacing.sm }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('recipe.cookingFor')}</Text>
        <View style={styles.stepper}>
          <Pressable
            testID="cooking-for-minus"
            onPress={() => setCookingFor((n) => Math.max(1, n - 1))}
            style={[styles.stepBtn, { borderColor: theme.border }]}
            hitSlop={6}
          >
            <Ionicons name="remove" size={18} color={theme.text} />
          </Pressable>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20, minWidth: 90, textAlign: 'center' }}>
            {t('recipes.servingsCount', { count: cookingFor })}
          </Text>
          <Pressable
            testID="cooking-for-plus"
            onPress={() => setCookingFor((n) => Math.min(24, n + 1))}
            style={[styles.stepBtn, { borderColor: theme.border }]}
            hitSlop={6}
          >
            <Ionicons name="add" size={18} color={theme.text} />
          </Pressable>
        </View>
        <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('recipe.cookingForHint')}</Text>
      </Card>

      {/* 4. What to buy */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('recipe.ingredients')}
      </Text>
      <Card style={{ paddingVertical: Spacing.xs }}>
        {ingredients.map((ing, i) => {
          const on = checked[ing.key];
          return (
            <Pressable
              key={`${ing.key}-${i}`}
              onPress={() => setChecked((c) => ({ ...c, [ing.key]: !c[ing.key] }))}
              style={[
                styles.ingredient,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              ]}
            >
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={20}
                color={on ? theme.primary : theme.textTertiary}
              />
              <Text
                style={{
                  color: on ? theme.textTertiary : theme.text,
                  flex: 1,
                  textDecorationLine: on ? 'line-through' : 'none',
                }}
              >
                {ing.name}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
                {ingredientAmountLabel(ing)}
              </Text>
            </Pressable>
          );
        })}
      </Card>

      {/* 5. What to do */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('recipe.steps')}
      </Text>
      <Card style={{ gap: Spacing.md }}>
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepNum, { backgroundColor: theme.cardSubtle }]}>
              <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
            </View>
            <Text style={{ color: theme.text, flex: 1, lineHeight: 21 }}>{step}</Text>
          </View>
        ))}
      </Card>

      {/* 6. How much of it you ate — separate from how much you cooked. */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('recipe.myPortion')}
      </Text>
      <Card style={{ gap: Spacing.sm }}>
        <View style={styles.chips}>
          {SERVING_STEPS.map((p) => {
            const active = portion === p;
            return (
              <Pressable
                key={p}
                onPress={() => {
                  lightHaptic();
                  setPortion(p);
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
        <Text style={{ color: theme.text, fontWeight: '700' }}>
          {t('recipe.portionMacros', {
            kcal: mine.calories,
            protein: mine.proteinG,
            carbs: mine.carbsG,
            fat: mine.fatG,
          })}
        </Text>
        <View style={styles.chips}>
          {MEAL_SLOTS.map((s) => {
            const active = slot === s;
            return (
              <Pressable
                key={s}
                onPress={() => setSlot(s)}
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
      </Card>

      <Button
        label={t('recipe.delete')}
        variant="ghost"
        icon="trash-outline"
        onPress={remove}
        style={{ marginTop: Spacing.sm }}
      />
    </Screen>
  );
}

function Meta({
  icon,
  label,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={14} color={theme.textTertiary} />
      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Macro({
  value,
  label,
  theme,
  big,
}: {
  value: string;
  label: string;
  theme: ReturnType<typeof useTheme>;
  big?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: big ? 24 : 17 }}>{value}</Text>
      <Text style={{ color: theme.textTertiary, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroRow: { flexDirection: 'row', alignItems: 'flex-end' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredient: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 11 },
  step: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  loggedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
});
