import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { RefineBox } from '@/components/refine-box';
import { Button, Card, MealTypePicker, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor, useViewDay } from '@/lib/day';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { normalizeDigits } from '@/lib/numbers';
import { usePending } from '@/lib/pending';
import { mealTypeForNow, useAppStore } from '@/lib/store';
import type { FoodItem, MealAnalysis, MealType } from '@/lib/types';

/** A meal item plus a portion multiplier used to scale AI-estimated macros. */
type Row = FoodItem & {
  _base?: { calories: number; proteinG: number; carbsG: number; fatG: number };
  _mult?: number;
};

const PORTIONS: { m: number; label: string }[] = [
  { m: 0.25, label: '¼' },
  { m: 0.5, label: '½' },
  { m: 1, label: '1' },
  { m: 1.5, label: '1½' },
  { m: 2, label: '2' },
];

export default function MealResult() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const analysis = usePending((s) => s.meal);
  const photoUri = usePending((s) => s.photoUri);
  const logMeal = useAppStore((s) => s.logMeal);
  const viewDay = useViewDay((s) => s.day);

  // Snapshot base macros for AI (non-barcode) items so a portion multiplier can
  // scale them; barcode items scale from their per-100g values instead.
  const [items, setItems] = useState<Row[]>(() =>
    (analysis?.items ?? []).map((it) =>
      it.basePer100
        ? { ...it }
        : {
            ...it,
            _mult: 1,
            _base: { calories: it.calories, proteinG: it.proteinG, carbsG: it.carbsG, fatG: it.fatG },
          },
    ),
  );
  const [mealType, setMealType] = useState<MealType>(
    () => usePending.getState().consumeMealTypeHint() ?? mealTypeForNow(),
  );

  useEffect(() => {
    if (!analysis && router.canGoBack()) router.back();
  }, [analysis, router]);

  if (!analysis) return null;

  const updateItem = (index: number, patch: Partial<FoodItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index: number) => {
    lightHaptic();
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Scale an AI item's macros to a portion multiple of the original estimate.
  const setMult = (index: number, mult: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index || !item._base) return item;
        return {
          ...item,
          _mult: mult,
          portionMultiplier: mult,
          calories: Math.round(item._base.calories * mult),
          proteinG: Math.round(item._base.proteinG * mult),
          carbsG: Math.round(item._base.carbsG * mult),
          fatG: Math.round(item._base.fatG * mult),
        };
      }),
    );
  };

  // Barcode / packaged items carry per-100g macros; scale them to the grams
  // the user actually ate.
  const setGrams = (index: number, grams: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index || !item.basePer100) return item;
        const f = grams / 100;
        return {
          ...item,
          gramsEaten: grams,
          portion: `${Math.round(grams)} g`,
          calories: Math.round(item.basePer100.calories * f),
          proteinG: Math.round(item.basePer100.proteinG * f),
          carbsG: Math.round(item.basePer100.carbsG * f),
          fatG: Math.round(item.basePer100.fatG * f),
        };
      }),
    );
  };

  // A refine correction returns the whole item list fresh — re-snapshot it
  // the same way the initial AI result was, so portion chips work on it too.
  const applyRefine = (result: MealAnalysis) => {
    setItems(
      result.items.map((it) =>
        it.basePer100
          ? { ...it }
          : {
              ...it,
              _mult: 1,
              _base: { calories: it.calories, proteinG: it.proteinG, carbsG: it.carbsG, fatG: it.fatG },
            },
      ),
    );
  };

  const total = items.reduce((sum, i) => sum + i.calories, 0);

  // Note: pending data is NOT cleared on close — clearing re-renders this
  // screen with empty state and double-fires the back navigation. The next
  // scan simply overwrites it.
  // Land on the Food tab so the user sees the meal appear in their log.
  const save = () => {
    if (items.length === 0) {
      if (router.canGoBack()) router.back();
      return;
    }
    // Strip the transient scaling fields before persisting.
    const clean: FoodItem[] = items.map((it) => ({
      name: it.name,
      portion: it.portion,
      calories: it.calories,
      proteinG: it.proteinG,
      carbsG: it.carbsG,
      fatG: it.fatG,
      ...(it.basePer100 ? { basePer100: it.basePer100, gramsEaten: it.gramsEaten } : {}),
      ...(it._mult != null ? { portionMultiplier: it._mult } : {}),
    }));
    logMeal(clean, photoUri ?? undefined, mealType, timestampFor(viewDay));
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.mealLogged'));
    router.dismissTo('/(tabs)/food');
  };

  return (
    <Screen
      footer={
        <View>
          <View style={[styles.totalBar, { backgroundColor: theme.cardSubtle }]}>
            <Text style={[Type.caption, { color: theme.textSecondary }]}>
              {t('mealResult.totalCalories')}
            </Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>
              {Math.round(total)} {t('common.kcal')}
            </Text>
          </View>
          <Button label={t('mealResult.logMeal')} onPress={save} />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            onPress={() => {
              if (router.canGoBack()) router.back();
            }}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      }
    >
      <Title>{t('mealResult.title')}</Title>
      <Subtitle>{t('mealResult.editHint2')}</Subtitle>

      {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />}

      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
        {t('mealResult.mealType')}
      </Text>
      <MealTypePicker value={mealType} onChange={setMealType} />

      {analysis.confidence < 0.6 && (
        <Card style={{ borderColor: theme.warning }}>
          <Text style={{ color: theme.warning }}>{t('mealResult.lowConfidence')}</Text>
        </Card>
      )}

      {(!!analysis.notes || !!analysis.sources?.length) && (
        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={14} color={theme.textTertiary} />
          <View style={{ flex: 1, gap: 2 }}>
            {!!analysis.notes && (
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {t('mealResult.notes', { notes: analysis.notes })}
              </Text>
            )}
            {!!analysis.sources?.length && (
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {t('mealResult.sources', { domains: analysis.sources.join(', ') })}
              </Text>
            )}
          </View>
        </View>
      )}

      {items.length === 0 && (
        <View style={[styles.emptyItems, { borderColor: theme.border }]}>
          <Ionicons name="fast-food-outline" size={28} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            {t('mealResult.noItems')}
          </Text>
        </View>
      )}

      {items.map((item, index) => (
        <Swipeable
          key={index}
          renderRightActions={() => (
            <Pressable onPress={() => removeItem(index)} style={styles.swipeDelete}>
              <Ionicons name="trash" size={22} color="#fff" />
              <Text style={styles.swipeDeleteText}>{t('common.delete')}</Text>
            </Pressable>
          )}
          overshootRight={false}
        >
        <Card>
          <View style={styles.itemHeader}>
            <TextInput
              defaultValue={item.name}
              onChangeText={(text) => updateItem(index, { name: text })}
              style={[styles.itemNameInput, { color: theme.text, borderColor: theme.border }]}
            />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{item.portion}</Text>
            <Pressable
              onPress={() => removeItem(index)}
              hitSlop={8}
              style={({ pressed }) => [styles.itemDelete, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
            </Pressable>
          </View>
          {item._base && (
            <View style={styles.portionRow}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600', marginEnd: 4 }}>
                {t('mealResult.portion')}
              </Text>
              {PORTIONS.map(({ m, label }) => {
                const active = Math.abs((item._mult ?? 1) - m) < 0.001;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMult(index, m)}
                    style={[
                      styles.portionChip,
                      { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' },
                    ]}
                  >
                    <Text style={{ color: active ? '#fff' : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {item.basePer100 && (
            <View style={[styles.gramsRow, { backgroundColor: theme.cardSubtle }]}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                {t('mealResult.amountEaten')}
              </Text>
              <TextInput
                defaultValue={String(Math.round(item.gramsEaten ?? 100))}
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={(text) => setGrams(index, parseInt(normalizeDigits(text), 10) || 0)}
                style={[
                  styles.gramsInput,
                  { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                ]}
              />
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{t('common.grams')}</Text>
            </View>
          )}
          <View style={styles.numRow}>
            <NumBox
              key={`c${item.gramsEaten ?? ''}${item._mult ?? ''}`}
              label={t('common.kcal')}
              value={item.calories}
              onChange={(v) => updateItem(index, { calories: v })}
            />
            <NumBox
              key={`p${item.gramsEaten ?? ''}${item._mult ?? ''}`}
              label={t('home.protein')}
              value={item.proteinG}
              onChange={(v) => updateItem(index, { proteinG: v })}
            />
            <NumBox
              key={`ca${item.gramsEaten ?? ''}${item._mult ?? ''}`}
              label={t('home.carbs')}
              value={item.carbsG}
              onChange={(v) => updateItem(index, { carbsG: v })}
            />
            <NumBox
              key={`f${item.gramsEaten ?? ''}${item._mult ?? ''}`}
              label={t('home.fat')}
              value={item.fatG}
              onChange={(v) => updateItem(index, { fatG: v })}
            />
          </View>
        </Card>
        </Swipeable>
      ))}

      {items.length > 0 && <RefineBox items={items} onResult={applyRefine} />}

      <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
        {t('common.aiDisclaimer')}
      </Text>
    </Screen>
  );
}

function NumBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.numBox}>
      <TextInput
        defaultValue={String(Math.round(value))}
        keyboardType="number-pad"
        maxLength={4}
        onChangeText={(text) => onChange(parseInt(normalizeDigits(text), 10) || 0)}
        style={[
          styles.numInput,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
        ]}
      />
      <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    height: 160,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  itemNameInput: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  itemDelete: { padding: 2 },
  portionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  portionChip: {
    minWidth: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  swipeDelete: {
    backgroundColor: '#E5574E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    gap: 2,
  },
  swipeDeleteText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  emptyItems: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  gramsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: Spacing.sm,
  },
  gramsInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 72,
  },
  numRow: { flexDirection: 'row', gap: Spacing.sm },
  numBox: { flex: 1 },
  numInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.sm,
  },
  totalValue: { fontSize: 22, fontWeight: '800' },
  disclaimer: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: Spacing.xs },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: Spacing.md,
  },
});
