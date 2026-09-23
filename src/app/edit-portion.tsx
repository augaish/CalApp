import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import {
  itemUnknownNutrients,
  knownLabel,
  loggedBasis,
  NUTRIENT_KEYS,
  roundMacros,
  scaleMacros,
  servingCountLabel,
  servingPluralCount,
  SERVING_STEPS,
} from '@/lib/recipes';
import { useAppStore } from '@/lib/store';
import type { NutrientKey } from '@/lib/types';

/**
 * Correct the portion on something already eaten.
 *
 * Undo only lasts as long as the screen you logged from, and people realise
 * they had more than they thought the next morning. Everything here rescales
 * the SNAPSHOT stored on that diary entry — never today's recipe, which may
 * have been edited since. The date, the meal it belongs to and the entry
 * itself all stay put; only the amount changes.
 */
export default function EditPortion() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { id, index } = useLocalSearchParams<{ id?: string; index?: string }>();

  const meals = useAppStore((s) => s.meals);
  const updateMeal = useAppStore((s) => s.updateMeal);

  const meal = meals.find((m) => m.id === id);
  const itemIndex = Number(index ?? 0);
  const item = meal?.items[itemIndex];

  const basis = item ? loggedBasis(item) : null;
  const [servings, setServings] = useState(item?.recipeServings ?? 1);

  if (!meal || !item) return null;

  const portionLabel = (n: number) =>
    `${servingCountLabel(n)} ${t('recipe.servingUnit', { count: servingPluralCount(n) })}`;

  // An entry with no serving information cannot be rescaled, and guessing a
  // basis would silently invent numbers. Say so and send them to the full
  // editor, which can change the values directly.
  if (!basis) {
    return (
      <Screen
        footer={
          <Button
            label={t('editPortion.openFullEditor')}
            icon="create-outline"
            onPress={() => router.replace(`/meal-edit?id=${encodeURIComponent(meal.id)}`)}
          />
        }
      >
        <Title close>{t('editPortion.title')}</Title>
        <Card style={{ gap: Spacing.sm }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>{item.name}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('editPortion.noServings')}</Text>
        </Card>
      </Screen>
    );
  }

  const current = { calories: item.calories, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG };
  // Rescaled from the unrounded basis, so editing five times lands exactly
  // where editing once would.
  const exactNext = scaleMacros(basis, servings);
  const next = roundMacros(exactNext);
  const changed = servings !== item.recipeServings;
  // Full precision internally: the difference between two unrounded amounts,
  // rounded once for display, so ¼ → ½ → 1 never accumulates a stray calorie.
  const delta = Math.round(exactNext.calories - scaleMacros(basis, item.recipeServings ?? 1).calories);
  // The snapshot's unknown values stay unknown after a correction (section 7),
  // and each nutrient is judged on its own: a recipe missing only its fat
  // still has a fully known calorie figure.
  const unknown = itemUnknownNutrients(item);
  const incompleteKcal = unknown.includes('calories');
  const kl = (v: number, k: NutrientKey) => knownLabel(v, unknown.includes(k));
  const nothingKnown = (m: typeof current) => unknown.length === NUTRIENT_KEYS.length && NUTRIENT_KEYS.every((k) => m[k] === 0);
  const nutrientName: Record<NutrientKey, string> = {
    calories: t('foodEdit.calories'),
    proteinG: t('home.protein'),
    carbsG: t('home.carbs'),
    fatG: t('home.fat'),
  };
  const unknownList = unknown.map((k) => nutrientName[k]).join(t('nutrition.listSeparator'));
  /** "{portion} · 420 kcal", "{portion} · ≥420 kcal", or "{portion} · Unknown". */
  const headline = (portion: string, kcal: number) =>
    incompleteKcal && kcal === 0 ? `${portion} · ${t('nutrition.unknown')}` : `${portion} · ${kl(kcal, 'calories')} ${t('common.kcal')}`;
  const macroLine = (m: typeof current) =>
    nothingKnown(m)
      ? t('nutrition.nothingKnown')
      : t('recipe.portionMacros', { kcal: kl(m.calories, 'calories'), protein: kl(m.proteinG, 'proteinG'), carbs: kl(m.carbsG, 'carbsG'), fat: kl(m.fatG, 'fatG') });

  const save = () => {
    const items = meal.items.map((it, i) =>
      i === itemIndex
        ? {
            ...it,
            calories: next.calories,
            proteinG: next.proteinG,
            carbsG: next.carbsG,
            fatG: next.fatG,
            portion: portionLabel(servings),
            recipeServings: servings,
            // Carried forward untouched: it is what this entry was worth when
            // it was logged, and a correction to the amount is not a change
            // to the recipe it came from.
            recipeBasis: basis,
          }
        : it,
    );
    // Same entry, same date, same meal — only the amount moves.
    updateMeal(meal.id, { items });
    successHaptic();
    router.back();
  };

  return (
    <Screen
      footer={
        <View style={{ gap: Spacing.xs }}>
          <Button label={t('editPortion.save')} icon="checkmark" onPress={save} disabled={!changed} />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
        </View>
      }
    >
      <Title close>{t('editPortion.title')}</Title>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>{item.name}</Text>

      {/* What is on record right now. */}
      <Card style={{ gap: 4 }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('editPortion.currently')}</Text>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{headline(portionLabel(item.recipeServings ?? 1), current.calories)}</Text>
        <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{macroLine(current)}</Text>
        {unknown.length > 0 && (
          <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
            {unknown.length === NUTRIENT_KEYS.length ? t('nutrition.allUnknownNote') : t('nutrition.knownSubtotalNote', { list: unknownList })}
          </Text>
        )}
      </Card>

      {/* The correction. */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('editPortion.newPortion')}
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

      {/* What it becomes, before saving. */}
      <Card style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>
          {incompleteKcal && next.calories === 0
            ? t('editPortion.changesToUnknown', { portion: portionLabel(servings) })
            : t('editPortion.changesTo', { portion: portionLabel(servings), kcal: kl(next.calories, 'calories') })}
          {changed && !incompleteKcal ? ` · ${delta >= 0 ? '+' : ''}${delta} ${t('common.kcal')}` : ''}
        </Text>
        {changed && incompleteKcal && (
          // A subtotal's change is a subtotal's change — never presented as
          // the exact calorie difference of a meal whose total is unknown.
          <Text style={{ color: theme.text, fontSize: 13 }}>
            <Text style={{ color: theme.textSecondary }}>{t('nutrition.changeKnown')}: </Text>
            <Text style={{ fontWeight: '700' }}>
              {delta >= 0 ? '+' : ''}
              {delta} {t('common.kcal')}
            </Text>
          </Text>
        )}
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{macroLine(next)}</Text>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={14} color={theme.textTertiary} />
          <Text style={{ color: theme.textTertiary, fontSize: 12, flex: 1 }}>
            {t('editPortion.scopeNote')}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
