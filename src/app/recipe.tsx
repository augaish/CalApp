import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PhotoFallback } from '@/components/photo-fallback';
import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic, lightHaptic } from '@/lib/feedback';
import {
  ingredientAmountLabel,
  isEstimated,
  isReady,
  perServing,
  roundMacros,
  scaleMacros,
  scaledIngredients,
  unknownNutritionCount,
  withIngredientAmount,
} from '@/lib/recipes';
import { useAppStore } from '@/lib/store';

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
  const { id, day, slot: slotParam } = useLocalSearchParams<{
    id?: string;
    /** Set when opened FROM a planned meal, which changes what the primary
     * action should be: there, you are about to eat it, not plan it. */
    day?: string;
    slot?: string;
  }>();
  const fromPlan = !!day;

  const recipes = useAppStore((s) => s.recipes);
  const updateRecipe = useAppStore((s) => s.updateRecipe);
  const mealPlanRecipes = useAppStore((s) => s.mealPlanRecipes);

  const recipe = recipes.find((r) => r.id === id);

  const [cookingFor, setCookingFor] = useState(recipe?.servings ?? 2);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [showTotals, setShowTotals] = useState(false);
  // Index of the ingredient being corrected, and the text in its field.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  if (!recipe) return null;

  const serving = roundMacros(perServing(recipe));
  const batch = roundMacros(scaleMacros(perServing(recipe), cookingFor));
  const ingredients = scaledIngredients(recipe, cookingFor);
  const estimated = isEstimated(recipe);

  const ready = isReady(recipe);
  const unknown = unknownNutritionCount(recipe);

  // "I ate" is its own review screen (S13): the meal, the date and the amount
  // are stated before a diary write, and this screen keeps "cooking for"
  // separate from it — doubling the batch must never double the diary.
  const goLog = () => {
    const q = new URLSearchParams({ recipeId: recipe.id });
    if (slotParam) q.set('slot', slotParam);
    if (day) q.set('day', day);
    router.push(`/log-portion?${q.toString()}`);
  };

  // An AI draft becomes usable only once a person has looked at it. The tap
  // is the review; there is nothing to fill in, only something to read.
  const markReady = () => {
    updateRecipe(recipe.id, { reviewStatus: 'ready' });
    successHaptic();
  };

  // How many planned meals this recipe currently stands on. Correcting a
  // quantity moves their totals too, so say so before it happens rather than
  // after.
  const plannedUses = Object.values(mealPlanRecipes).reduce(
    (n, day) => n + Object.values(day).filter((e) => e?.recipeId === recipe.id).length,
    0,
  );

  const saveAmount = (i: number) => {
    const value = Number(draft.replace(/[^0-9.]/g, ''));
    setEditing(null);
    if (!(value > 0)) return;
    const next = withIngredientAmount(recipe, i, value);
    if (next === recipe) return;
    updateRecipe(recipe.id, { ingredients: next.ingredients });
    successHaptic();
  };

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
        !ready ? (
          <Button label={t('recipe.markReady')} icon="checkmark-circle" onPress={markReady} />
        ) : fromPlan ? (
          // Opened from today's plan: you are about to eat it.
          <Button label={t('recipe.logEatenShort')} icon="add" onPress={goLog} />
        ) : (
          // Discovery: planning is the likely next step, but logging stays one
          // tap away for someone who just cooked it.
          <View style={{ gap: Spacing.xs }}>
            <Button
              label={t('recipe.addToPlan')}
              icon="calendar"
              onPress={() => router.push(`/plan-meal?recipeId=${encodeURIComponent(recipe.id)}`)}
            />
            <Button label={t('recipe.logEatenShort')} variant="secondary" icon="add" onPress={goLog} />
          </View>
        )
      }
    >
      {/* 1. What it is */}
      {/* Photo or category illustration — same geometry either way (C09). */}
      <View style={styles.titleRow}>
        <PhotoFallback uri={recipe.photoUri} size={64} />
        <View style={{ flex: 1 }}>
          <Title>{recipe.name}</Title>
        </View>
        <Pressable
          onPress={() => router.push(`/recipe-edit?id=${encodeURIComponent(recipe.id)}`)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('recipe.edit')}
        >
          <Ionicons name="create-outline" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>
      {!ready && (
        <Card style={{ borderColor: theme.warning, borderWidth: 1, marginBottom: Spacing.md }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>{t('recipe.needsReviewTitle')}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>{t('recipe.needsReviewBody')}</Text>
        </Card>
      )}
      {unknown > 0 && (
        <Text style={{ color: theme.warning, fontSize: 12, marginBottom: Spacing.sm }}>
          {t('recipeEdit.unknownNote', { n: unknown })}
        </Text>
      )}
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
        {showTotals && estimated && (
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('recipe.estimatedDetail')}</Text>
        )}
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
      {plannedUses > 0 && (
        <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 6 }}>
          {t('recipe.onPlannedMeals', { count: plannedUses })}
        </Text>
      )}
      <Card style={{ paddingVertical: Spacing.xs }}>
        {ingredients.map((ing, i) => {
          const on = checked[ing.key];
          const isEditing = editing === i;
          return (
            <View
              key={`${ing.key}-${i}`}
              style={[
                styles.ingredient,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              ]}
            >
              <Pressable onPress={() => setChecked((c) => ({ ...c, [ing.key]: !c[ing.key] }))} hitSlop={6}>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={on ? theme.primary : theme.textTertiary}
                />
              </Pressable>
              <Text
                style={{
                  color: on ? theme.textTertiary : theme.text,
                  flex: 1,
                  textDecorationLine: on ? 'line-through' : 'none',
                }}
              >
                {ing.name}
              </Text>
              {isEditing ? (
                <View style={[styles.amountEdit, { borderColor: theme.primary }]}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    keyboardType="numeric"
                    autoFocus
                    selectTextOnFocus
                    style={{ color: theme.text, fontSize: 14, fontWeight: '700', minWidth: 46, padding: 0, textAlign: 'center' }}
                    onBlur={() => saveAmount(i)}
                    onSubmitEditing={() => saveAmount(i)}
                  />
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{ing.unit}</Text>
                </View>
              ) : (
                // The visible way to correct a quantity. Only offered at the
                // recipe's own batch size: editing a scaled-up view would
                // have to divide the change back down, which is a good way to
                // save a number nobody typed.
                <Pressable
                  onPress={() => {
                    if (cookingFor !== recipe.servings) {
                      Alert.alert(t('recipe.editAtBatchTitle'), t('recipe.editAtBatchBody'));
                      return;
                    }
                    lightHaptic();
                    setDraft(String(Math.round(ing.amount * 10) / 10));
                    setEditing(i);
                  }}
                  hitSlop={6}
                  style={styles.amountTap}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
                    {ingredientAmountLabel(ing)}
                  </Text>
                  <Ionicons name="pencil" size={13} color={theme.textTertiary} />
                </Pressable>
              )}
            </View>
          );
        })}
      </Card>

      {/* 5. What to do */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('recipe.steps')}
      </Text>
      <Card style={{ gap: Spacing.md }}>
        {recipe.steps.length === 0 && (
          // A hand-written recipe may have none yet; an empty card says nothing.
          <Text style={{ color: theme.textTertiary, fontSize: 13 }}>{t('recipe.noSteps')}</Text>
        )}
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepNum, { backgroundColor: theme.cardSubtle }]}>
              <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
            </View>
            <Text style={{ color: theme.text, flex: 1, lineHeight: 21 }}>{step}</Text>
          </View>
        ))}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
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
  amountTap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  amountEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
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
