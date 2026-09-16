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
  loggedBasis,
  roundMacros,
  scaleMacros,
  servingCountLabel,
  servingPluralCount,
  SERVING_STEPS,
} from '@/lib/recipes';
import { useAppStore } from '@/lib/store';

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
        <Title>{t('editPortion.title')}</Title>
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
  const next = roundMacros(scaleMacros(basis, servings));
  const changed = servings !== item.recipeServings;
  const delta = next.calories - current.calories;

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
      <Title>{t('editPortion.title')}</Title>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>{item.name}</Text>

      {/* What is on record right now. */}
      <Card style={{ gap: 4 }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('editPortion.currently')}</Text>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>
          {portionLabel(item.recipeServings ?? 1)} · {current.calories} {t('common.kcal')}
        </Text>
        <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
          {t('recipe.portionMacros', {
            kcal: current.calories,
            protein: current.proteinG,
            carbs: current.carbsG,
            fat: current.fatG,
          })}
        </Text>
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
          {t('editPortion.changesTo', { portion: portionLabel(servings), kcal: next.calories })}
          {changed ? ` · ${delta >= 0 ? '+' : ''}${delta} ${t('common.kcal')}` : ''}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          {t('recipe.portionMacros', {
            kcal: next.calories,
            protein: next.proteinG,
            carbs: next.carbsG,
            fat: next.fatG,
          })}
        </Text>
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
