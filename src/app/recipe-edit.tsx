import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Field, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { resolveIngredientKey } from '@/lib/ingredients';
import { normalizeDigits } from '@/lib/numbers';
import { unknownNutrientsOf } from '@/lib/recipes';
import { useAppStore } from '@/lib/store';
import { useAllRecipes } from '@/lib/use-recipes';
import type { NutrientKey, Recipe, RecipeIngredient } from '@/lib/types';

/** A row as typed, before it becomes an ingredient. Strings, so a half-typed
 * "7." is never reformatted out from under someone. */
interface Draft {
  name: string;
  amount: string;
  unit: 'g' | 'ml';
  state: 'raw' | 'cooked';
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

const EMPTY: Draft = { name: '', amount: '', unit: 'g', state: 'raw', calories: '', proteinG: '', carbsG: '', fatG: '' };

function toDraft(i: RecipeIngredient): Draft {
  const unknown = unknownNutrientsOf(i);
  const s = (n: number, k: NutrientKey) => (unknown.includes(k) ? '' : String(n));
  return {
    name: i.name,
    amount: String(i.amount),
    unit: i.unit,
    state: i.state ?? 'raw',
    calories: s(i.calories, 'calories'),
    proteinG: s(i.proteinG, 'proteinG'),
    carbsG: s(i.carbsG, 'carbsG'),
    fatG: s(i.fatG, 'fatG'),
  };
}

const num = (v: string): number | undefined => {
  const n = parseFloat(normalizeDigits(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Write or correct a recipe yourself (S28). No AI, no network: the journey
 * from recipe to plan to shopping to diary has to work when generation is
 * down, and for the dishes nobody needs a model to describe.
 *
 * Nutrition a person did not enter is recorded as unknown, not as zero
 * (section 7). The recipe then says how many ingredients are in that state
 * wherever a total is shown, so a partial sum never reads as a complete one.
 */
export default function RecipeEdit() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const recipes = useAllRecipes();
  const addRecipe = useAppStore((s) => s.addRecipe);
  const updateRecipe = useAppStore((s) => s.updateRecipe);
  const existing = id ? recipes.find((r) => r.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [servings, setServings] = useState(String(existing?.servings ?? 2));
  const [prep, setPrep] = useState(existing?.prepMinutes ? String(existing.prepMinutes) : '');
  const [cook, setCook] = useState(existing?.cookMinutes ? String(existing.cookMinutes) : '');
  const [rows, setRows] = useState<Draft[]>(existing ? existing.ingredients.map(toDraft) : [{ ...EMPTY }]);
  const [steps, setSteps] = useState<string[]>(existing?.steps.length ? [...existing.steps] : ['']);
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const build = (): { recipe: Omit<Recipe, 'id' | 'createdAt'> } | { error: string } => {
    const cleanName = name.trim();
    if (!cleanName) return { error: t('recipeEdit.needName') };
    const nServings = num(servings);
    if (!nServings || nServings < 1 || nServings > 50) return { error: t('recipeEdit.needServings') };

    const ingredients: RecipeIngredient[] = [];
    for (const r of rows) {
      const iname = r.name.trim();
      const amount = num(r.amount);
      if (!iname && !amount) continue; // an untouched blank row
      if (!iname) return { error: t('recipeEdit.needIngredientName') };
      if (!amount || amount <= 0) return { error: t('recipeEdit.needAmount', { name: iname }) };
      const kcal = num(r.calories);
      const p = num(r.proteinG);
      const c = num(r.carbsG);
      const f = num(r.fatG);
      const entered = [kcal, p, c, f].some((v) => v != null);
      // A blank beside an entered value is unknown for that nutrient only.
      const unknownKeys = (['calories', 'proteinG', 'carbsG', 'fatG'] as NutrientKey[]).filter((_, idx) => [kcal, p, c, f][idx] == null);
      ingredients.push({
        name: iname,
        // Resolved locally so a shopping list merges this onion with every
        // other onion, whatever spelling it was typed in.
        key: resolveIngredientKey(iname),
        amount: Math.round(amount * 10) / 10,
        unit: r.unit,
        state: r.state,
        calories: Math.max(0, Math.round(kcal ?? 0)),
        proteinG: Math.max(0, Math.round((p ?? 0) * 10) / 10),
        carbsG: Math.max(0, Math.round((c ?? 0) * 10) / 10),
        fatG: Math.max(0, Math.round((f ?? 0) * 10) / 10),
        ...(entered ? (unknownKeys.length ? { unknownNutrients: unknownKeys } : {}) : { macrosUnknown: true as const }),
      });
    }
    if (ingredients.length === 0) return { error: t('recipeEdit.needIngredient') };

    return {
      recipe: {
        name: cleanName.slice(0, 80),
        servings: Math.round(nServings),
        prepMinutes: num(prep) || undefined,
        cookMinutes: num(cook) || undefined,
        ingredients,
        steps: steps.map((s) => s.trim()).filter(Boolean).slice(0, 15),
        language: existing?.language ?? lang,
        // A person wrote it, so it is theirs and ready. Editing an AI draft
        // is exactly the review the draft was waiting for.
        source: existing?.source === 'ai' ? 'ai' : 'custom',
        reviewStatus: 'ready',
        favorite: existing?.favorite,
        lastCookedAt: existing?.lastCookedAt,
        photoUri: existing?.photoUri,
        notes: existing?.notes,
        cookedYieldG: existing?.cookedYieldG,
        cookedYieldMeasured: existing?.cookedYieldMeasured,
      },
    };
  };

  const save = () => {
    const out = build();
    if ('error' in out) {
      setError(out.error);
      return;
    }
    setError(null);
    if (existing) {
      // Editing a starter makes a private copy; the original stays as shipped.
      if (existing.source === 'calgym') {
        // Customising a bundled original makes a separate private copy; the
        // original stays in the Calgym collection untouched (AT45).
        const copyId = addRecipe({ ...out.recipe, source: 'custom' });
        successHaptic();
        router.replace(`/recipe?id=${encodeURIComponent(copyId)}`);
        return;
      }
      updateRecipe(existing.id, { ...out.recipe, source: out.recipe.source });
      successHaptic();
      router.back();
      return;
    }
    const newId = addRecipe(out.recipe);
    successHaptic();
    router.replace(`/recipe?id=${encodeURIComponent(newId)}`);
  };

  const cancel = () => {
    const dirty =
      name !== (existing?.name ?? '') ||
      rows.some((r) => r.name || r.amount) !== !!existing ||
      steps.some((s) => s.trim()) !== !!existing?.steps.length;
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(t('recipeEdit.discardTitle'), t('recipeEdit.discardBody'), [
      { text: t('recipeEdit.keepEditing'), style: 'cancel' },
      { text: t('recipeEdit.discard'), style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const unknownRows = rows.filter(
    (r) => (r.name.trim() || num(r.amount)) && ![r.calories, r.proteinG, r.carbsG, r.fatG].every((v) => num(v) != null),
  ).length;

  return (
    <Screen
      footer={
        <View style={{ gap: Spacing.xs }}>
          <Button label={existing ? t('common.save') : t('recipeEdit.saveNew')} icon="checkmark" onPress={save} />
          <Button label={t('common.cancel')} variant="ghost" onPress={cancel} />
        </View>
      }
    >
      <Title>{existing ? t('recipeEdit.editTitle') : t('recipeEdit.title')}</Title>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>{t('recipeEdit.subtitle')}</Text>

      {error && (
        <View style={[styles.error, { backgroundColor: theme.cardSubtle, borderColor: theme.danger }]}>
          <Ionicons name="alert-circle" size={16} color={theme.danger} />
          <Text style={{ color: theme.danger, flex: 1, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Field label={t('recipeEdit.name')} value={name} onChangeText={setName} placeholder={t('recipeEdit.namePlaceholder')} maxLength={80} />
      <View style={styles.row3}>
        <View style={{ flex: 1 }}>
          <Field label={t('recipeEdit.servings')} value={servings} onChangeText={setServings} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('recipeEdit.prep')} value={prep} onChangeText={setPrep} keyboardType="number-pad" suffix={t('session.minutes')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('recipeEdit.cook')} value={cook} onChangeText={setCook} keyboardType="number-pad" suffix={t('session.minutes')} />
        </View>
      </View>

      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>{t('recipe.ingredients')}</Text>
      <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: Spacing.sm }}>{t('recipeEdit.ingredientHint')}</Text>
      {rows.map((r, i) => (
        <Card key={i} style={{ gap: Spacing.sm }}>
          <View style={styles.rowLine}>
            <TextInput
              value={r.name}
              onChangeText={(v) => setRow(i, { name: v })}
              placeholder={t('recipeEdit.ingredientName')}
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { color: theme.text, borderColor: theme.border, flex: 1 }]}
              maxLength={60}
            />
            <Pressable
              onPress={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, n) => n !== i) : [{ ...EMPTY }]))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('recipeEdit.removeIngredient')}
            >
              <Ionicons name="close-circle" size={22} color={theme.textTertiary} />
            </Pressable>
          </View>
          <View style={styles.rowLine}>
            <TextInput
              value={r.amount}
              onChangeText={(v) => setRow(i, { amount: v })}
              placeholder={t('recipeEdit.amount')}
              placeholderTextColor={theme.textTertiary}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.border, width: 90 }]}
            />
            <Seg
              options={[
                { value: 'g', label: t('common.grams') },
                { value: 'ml', label: 'ml' },
              ]}
              value={r.unit}
              onChange={(v) => setRow(i, { unit: v as 'g' | 'ml' })}
            />
            <Seg
              options={[
                { value: 'raw', label: t('recipeEdit.raw') },
                { value: 'cooked', label: t('shopping.cooked') },
              ]}
              value={r.state}
              onChange={(v) => setRow(i, { state: v as 'raw' | 'cooked' })}
            />
          </View>
          <Text style={{ color: theme.textTertiary, fontSize: 11 }}>{t('recipeEdit.nutritionForAmount')}</Text>
          <View style={styles.rowLine}>
            {(['calories', 'proteinG', 'carbsG', 'fatG'] as const).map((k) => (
              <View key={k} style={{ flex: 1 }}>
                <Text style={{ color: theme.textTertiary, fontSize: 11, marginBottom: 2 }}>
                  {k === 'calories' ? t('common.kcal') : t(`onboarding.${k === 'proteinG' ? 'protein' : k === 'carbsG' ? 'carbs' : 'fat'}`)}
                </Text>
                <TextInput
                  value={r[k]}
                  onChangeText={(v) => setRow(i, { [k]: v } as Partial<Draft>)}
                  placeholder="—"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="decimal-pad"
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                />
              </View>
            ))}
          </View>
        </Card>
      ))}
      <Button label={t('recipeEdit.addIngredient')} variant="secondary" icon="add" onPress={() => setRows((rs) => [...rs, { ...EMPTY }])} />
      {unknownRows > 0 && (
        <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>
          {t('recipeEdit.unknownNote', { n: unknownRows })}
        </Text>
      )}

      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.lg, marginBottom: 6 }]}>{t('recipe.steps')}</Text>
      {steps.map((s, i) => (
        <View key={i} style={[styles.rowLine, { marginBottom: Spacing.sm }]}>
          <Text style={{ color: theme.textTertiary, width: 20 }}>{i + 1}.</Text>
          <TextInput
            value={s}
            onChangeText={(v) => setSteps((ss) => ss.map((x, n) => (n === i ? v : x)))}
            placeholder={t('recipeEdit.stepPlaceholder')}
            placeholderTextColor={theme.textTertiary}
            style={[styles.input, { color: theme.text, borderColor: theme.border, flex: 1 }]}
            multiline
            maxLength={300}
          />
          <Pressable
            onPress={() => setSteps((ss) => (ss.length > 1 ? ss.filter((_, n) => n !== i) : ['']))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('recipeEdit.removeStep')}
          >
            <Ionicons name="close-circle" size={22} color={theme.textTertiary} />
          </Pressable>
        </View>
      ))}
      <Button label={t('recipeEdit.addStep')} variant="secondary" icon="add" onPress={() => setSteps((ss) => [...ss, ''])} />
    </Screen>
  );
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: theme.cardSubtle }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segItem, on && { backgroundColor: theme.card }]}
          >
            <Text style={{ color: on ? theme.text : theme.textSecondary, fontSize: 12, fontWeight: '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row3: { flexDirection: 'row', gap: Spacing.sm },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, minHeight: 40 },
  seg: { flexDirection: 'row', borderRadius: Radius.full, padding: 2 },
  segItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: Radius.sm, borderWidth: 1, marginBottom: Spacing.md },
});
