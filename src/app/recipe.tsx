import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { illustrationFor, PhotoFallback } from '@/components/photo-fallback';
import { ActionButton, IconTile, InfoLine, StatusPill } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
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
import type { RecipeAisle } from '@/lib/types';
import { ensureRecipeInStore, useAllRecipes } from '@/lib/use-recipes';

const AISLE_ICON: Record<RecipeAisle, keyof typeof Ionicons.glyphMap> = {
  produce: 'leaf-outline',
  meat: 'fish-outline',
  dairy: 'water-outline',
  bakery: 'cafe-outline',
  pantry: 'basket-outline',
  frozen: 'snow-outline',
  spices: 'flask-outline',
  other: 'cube-outline',
};
const COLLAPSED_INGREDIENTS = 4;

/**
 * S10 Recipe detail — what it is, what a serving costs, how much you are
 * cooking, what to buy, what to do, then the action. "Cooking for" scales
 * the batch and the shopping; per-serving nutrition stays constant; the
 * diary is only written from Log eaten's own review (S13). Estimated
 * status follows the source, whatever the picture looks like (AT12).
 */
export default function RecipeScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const { id, day, slot: slotParam } = useLocalSearchParams<{ id?: string; day?: string; slot?: string }>();
  // Opened FROM a planned meal: you are about to eat it, not plan it.
  const fromPlan = !!day;

  const recipes = useAllRecipes();
  const updateRecipe = useAppStore((s) => s.updateRecipe);
  const mealPlanRecipes = useAppStore((s) => s.mealPlanRecipes);
  const recipe = recipes.find((r) => r.id === id);

  const [cookingFor, setCookingFor] = useState(recipe?.servings ?? 2);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [showTotals, setShowTotals] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  if (!recipe) return null;

  const serving = roundMacros(perServing(recipe));
  const batch = roundMacros(scaleMacros(perServing(recipe), cookingFor));
  const ingredients = scaledIngredients(recipe, cookingFor);
  const estimated = isEstimated(recipe);
  const ready = isReady(recipe);
  const unknown = unknownNutritionCount(recipe);
  const visibleIngredients = showAll || ingredients.length <= COLLAPSED_INGREDIENTS + 1 ? ingredients : ingredients.slice(0, COLLAPSED_INGREDIENTS);
  const minutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  const goLog = () => {
    const q = new URLSearchParams({ recipeId: recipe.id });
    if (slotParam) q.set('slot', slotParam);
    if (day) q.set('day', day);
    router.push(`/log-portion?${q.toString()}`);
  };

  // An AI draft becomes usable once a person has looked at it. The tap is
  // the review; nutrition stays estimated afterwards (AT46).
  const markReady = () => {
    updateRecipe(recipe.id, { reviewStatus: 'ready' });
    successHaptic();
  };

  const toggleFavorite = () => {
    const stored = ensureRecipeInStore(recipe.id, lang);
    if (!stored) return;
    updateRecipe(recipe.id, { favorite: !stored.favorite });
    lightHaptic();
  };

  const plannedUses = Object.values(mealPlanRecipes).reduce((n, d) => n + Object.values(d).filter((e) => e?.recipeId === recipe.id).length, 0);

  const saveAmount = (i: number) => {
    const value = Number(draft.replace(/[^0-9.]/g, ''));
    setEditing(null);
    if (!(value > 0)) return;
    const next = withIngredientAmount(recipe, i, value);
    if (next === recipe) return;
    // Editing a starter makes a private copy; the original is untouched.
    ensureRecipeInStore(recipe.id, lang);
    updateRecipe(recipe.id, { ingredients: next.ingredients, source: recipe.source === 'calgym' ? 'custom' : recipe.source });
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
      header={
        <PageHeader
          title={t('recipe.title')}
          backLabel={t('recipes.title')}
          right={
            <Pressable onPress={toggleFavorite} hitSlop={8} accessibilityRole="button" accessibilityLabel={t(recipe.favorite ? 'recipes.unfavorite' : 'recipes.favorite')} accessibilityState={{ selected: !!recipe.favorite }} style={styles.heart}>
              <Ionicons name={recipe.favorite ? 'heart' : 'heart-outline'} size={24} color={theme.onGradient} />
            </Pressable>
          }
        />
      }
      footer={
        !ready ? (
          <Button label={t('recipe.markReady')} icon="checkmark-circle" onPress={markReady} />
        ) : fromPlan ? (
          <Button label={t('recipe.logEatenShort')} icon="add" onPress={goLog} />
        ) : (
          <View style={styles.footerRow}>
            <Button label={t('recipe.addToPlan')} onPress={() => router.push(`/plan-meal?recipeId=${encodeURIComponent(recipe.id)}`)} style={{ flex: 1 }} />
            <Button label={t('recipe.logEatenShort')} variant="secondary" onPress={goLog} style={{ flex: 1 }} />
          </View>
        )
      }
    >
      {/* 1. What it is — photo or category illustration, same geometry (C09). */}
      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <View style={styles.head}>
          <PhotoFallback uri={recipe.photoUri} illustration={illustrationFor(recipe.name)} size={112} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20, letterSpacing: -0.3 }} numberOfLines={3}>
              {recipe.name}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
              {minutes > 0 ? `${t('recipes.minutes', { n: minutes })} · ` : ''}
              {t('recipe.makesServings', { count: recipe.servings })}
            </Text>
            <View style={styles.pills}>
              {estimated && <StatusPill label={t('recipe.estimatedShort')} tone="neutral" />}
              {recipe.source === 'calgym' && <StatusPill label={t('recipe.calgymValues')} tone="neutral" />}
              {!ready && <StatusPill label={t('recipe.needsReviewTitle')} tone="review" />}
            </View>
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: Spacing.sm }}>{t('recipe.perServing')}</Text>
            <Text style={{ color: theme.text }}>
              <Text style={{ fontSize: 24, fontWeight: '800' }}>{serving.calories}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textSecondary }}> {t('common.kcal')}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {t('home.protein')} {serving.proteinG} {t('common.grams')} · {t('home.carbs')} {serving.carbsG} {t('common.grams')} · {t('home.fat')} {serving.fatG} {t('common.grams')}
            </Text>
          </View>
        </View>
        {!ready && (
          <View style={[styles.reviewBox, { backgroundColor: theme.surfaceTint }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{t('recipe.needsReviewTitle')}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{t('recipe.needsReviewBody')}</Text>
          </View>
        )}
        {unknown > 0 && (
          <Text style={{ color: theme.warningText, fontSize: 12, marginTop: Spacing.sm }}>{t('recipeEdit.unknownNote', { n: unknown })}</Text>
        )}
        {!!recipe.description && <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: Spacing.sm, lineHeight: 20 }}>{recipe.description}</Text>}
        <Pressable onPress={() => setShowTotals((v) => !v)} hitSlop={8} accessibilityRole="button" style={{ marginTop: Spacing.sm }}>
          <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>{showTotals ? t('recipe.hideTotals') : t('recipe.showTotals')}</Text>
        </Pressable>
        {showTotals && (
          <>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>
              {t('recipe.batchTotals', { servings: cookingFor, kcal: batch.calories, protein: batch.proteinG, carbs: batch.carbsG, fat: batch.fatG })}
            </Text>
            {estimated && <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: 2 }}>{t('recipe.estimatedDetail')}</Text>}
          </>
        )}
      </View>

      {/* 2. How much you are cooking — the pan and the shopping, nothing else. */}
      <View style={[styles.rowCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, flex: 1 }}>{t('recipe.cookingFor')}</Text>
        <View style={[styles.stepper, { direction: 'ltr' }]}>
          <Pressable testID="cooking-for-minus" onPress={() => setCookingFor((n) => Math.max(1, n - 1))} accessibilityRole="button" accessibilityLabel="−" style={[styles.stepBtn, { backgroundColor: theme.surfaceTint }]} hitSlop={6}>
            <Ionicons name="remove" size={18} color={theme.primary} />
          </Pressable>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, minWidth: 32, textAlign: 'center' }}>{cookingFor}</Text>
          <Pressable testID="cooking-for-plus" onPress={() => setCookingFor((n) => Math.min(24, n + 1))} accessibilityRole="button" accessibilityLabel="+" style={[styles.stepBtn, { backgroundColor: theme.surfaceTint }]} hitSlop={6}>
            <Ionicons name="add" size={18} color={theme.primary} />
          </Pressable>
        </View>
        <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '600' }}>{t('recipe.servingUnit', { count: cookingFor })}</Text>
      </View>
      {cookingFor !== recipe.servings && <InfoLine>{t('recipe.cookingForHint')}</InfoLine>}

      {/* 3. What to buy */}
      <View style={[styles.card, { backgroundColor: theme.card, marginTop: Spacing.sm }, cardShadow(theme.shadow)]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: 4 }}>{t('recipe.ingredients')}</Text>
        {plannedUses > 0 && <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 4 }}>{t('recipe.onPlannedMeals', { count: plannedUses })}</Text>}
        {visibleIngredients.map((ing, i) => {
          const on = checked[ing.key];
          const isEditing = editing === i;
          return (
            <View key={`${ing.key}-${i}`} style={[styles.ingredient, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <Pressable
                onPress={() => setChecked((c) => ({ ...c, [ing.key]: !c[ing.key] }))}
                hitSlop={6}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!on }}
                accessibilityLabel={ing.name}
              >
                <IconTile icon={on ? 'checkmark' : AISLE_ICON[ing.aisle ?? 'other']} size={32} color={on ? theme.successText : undefined} />
              </Pressable>
              <Text style={{ color: on ? theme.textTertiary : theme.text, flex: 1, fontSize: 15, textDecorationLine: on ? 'line-through' : 'none' }}>
                {ing.name}
                <Text style={{ color: theme.textSecondary }}>
                  {' · '}
                  {ingredientAmountLabel(ing)}
                  {ing.macrosUnknown ? ` · ${t('recipeEdit.unknownShort')}` : ''}
                </Text>
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
                // Correcting a quantity is only offered at the recipe's own
                // batch size, so nothing is divided back into a number nobody typed.
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
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('recipe.edit')} · ${ing.name}`}
                  style={styles.amountTap}
                >
                  <Ionicons name="pencil-outline" size={16} color={theme.textTertiary} />
                </Pressable>
              )}
            </View>
          );
        })}
        {ingredients.length > COLLAPSED_INGREDIENTS + 1 && (
          <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={[styles.viewAll, { borderTopColor: theme.border }]}>
            <Text style={{ color: theme.primary, fontWeight: '700', flex: 1 }}>{showAll ? t('recipe.showFewer') : t('recipe.viewAll', { n: ingredients.length })}</Text>
            <Ionicons name={showAll ? 'chevron-up' : 'chevron-forward'} size={18} color={theme.primary} />
          </Pressable>
        )}
      </View>

      {/* 4. What to do */}
      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: Spacing.sm }}>{t('recipe.cookingSteps')}</Text>
        {recipe.steps.length === 0 && <Text style={{ color: theme.textTertiary, fontSize: 13 }}>{t('recipe.noSteps')}</Text>}
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepNum, { backgroundColor: theme.surfaceTint }]}>
              <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
            </View>
            <Text style={{ color: theme.text, flex: 1, lineHeight: 22, fontSize: 15 }}>{step}</Text>
          </View>
        ))}
        <Pressable onPress={() => router.push(`/recipe-edit?id=${encodeURIComponent(recipe.id)}`)} accessibilityRole="button" style={styles.editLink}>
          <Ionicons name="pencil-outline" size={16} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '700', textDecorationLine: 'underline' }}>{t('recipe.edit')}</Text>
        </Pressable>
      </View>

      <Text style={[Type.caption, { color: theme.textTertiary, textAlign: 'center', marginBottom: Spacing.sm }]}>{t('recipe.cookingForHint')}</Text>
      {recipe.source !== 'calgym' && (
        <View style={{ alignItems: 'center' }}>
          <ActionButton label={t('recipe.delete')} icon="trash-outline" variant="secondary" onPress={remove} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.module, padding: Spacing.md },
  head: { flexDirection: 'row', gap: Spacing.ms, alignItems: 'flex-start' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  reviewBox: { borderRadius: Radius.control, padding: Spacing.ms, marginTop: Spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  ingredient: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, minHeight: 48 },
  amountTap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  amountEdit: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  viewAll: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.ms, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  step: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginBottom: Spacing.sm },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
});
