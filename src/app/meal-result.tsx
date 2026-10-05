import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { AllergyBanner } from '@/components/allergy-banner';
import { Icon } from '@/components/icon';
import { PortionControl } from '@/components/portion-control';
import { RefineBox } from '@/components/refine-box';
import { Text, TextInput } from '@/components/text';
import { Button, Card, MealTypePicker, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor, useViewDay } from '@/lib/day';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { normalizeDigits } from '@/lib/numbers';
import { usePending } from '@/lib/pending';
import { settleLoggedPortion, withMacroEdit } from '@/lib/portion';
import { mealTypeForNow, useAppStore } from '@/lib/store';
import type { FoodItem, MealAnalysis, MealType } from '@/lib/types';

export default function MealResult() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const analysis = usePending((s) => s.meal);
  const photoUri = usePending((s) => s.photoUri);
  const logMeal = useAppStore((s) => s.logMeal);
  const viewDay = useViewDay((s) => s.day);
  const scrollRef = useRef<ScrollView>(null);

  const [items, setItems] = useState<FoodItem[]>(() => (analysis?.items ?? []).map((it) => ({ ...it })));
  const [mealType, setMealType] = useState<MealType>(
    () => usePending.getState().consumeMealTypeHint() ?? mealTypeForNow(),
  );

  useEffect(() => {
    if (!analysis && router.canGoBack()) router.back();
  }, [analysis, router]);

  if (!analysis) return null;

  const updateItem = (index: number, patch: Partial<FoodItem>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        // A macro typed by hand becomes this portion's figure; the portion
        // still scales it.
        const macros: Partial<Pick<FoodItem, 'calories' | 'proteinG' | 'carbsG' | 'fatG'>> = {};
        for (const k of ['calories', 'proteinG', 'carbsG', 'fatG'] as const) if (typeof patch[k] === 'number') macros[k] = patch[k];
        return Object.keys(macros).length ? { ...withMacroEdit(item, macros), ...patch } : { ...item, ...patch };
      }),
    );
  };

  const replaceItem = (index: number, next: FoodItem) => {
    setItems((prev) => prev.map((item, i) => (i === index ? next : item)));
  };

  const removeItem = (index: number) => {
    lightHaptic();
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // A refine correction returns the whole item list fresh, each item one
  // portion of what it describes.
  const applyRefine = (result: MealAnalysis) => {
    setItems(result.items.map((it) => ({ ...it })));
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
    // Only what a diary entry keeps; a packaged food's logged amount becomes
    // its "1" for later edits.
    const clean: FoodItem[] = items.map((it) => settleLoggedPortion({
      name: it.name,
      portion: it.portion,
      calories: it.calories,
      proteinG: it.proteinG,
      carbsG: it.carbsG,
      fatG: it.fatG,
      ...(it.basePer100 ? { basePer100: it.basePer100, gramsEaten: it.gramsEaten } : {}),
      ...(it.portionBase ? { portionBase: it.portionBase, portionMultiplier: it.portionMultiplier } : {}),
    }));
    logMeal(clean, photoUri ?? undefined, mealType, timestampFor(viewDay));
    successHaptic();
    useCelebrate.getState().celebrate(t('celebrate.mealLogged'));
    router.dismissTo('/(tabs)/food');
  };

  return (
    <Screen
      scrollRef={scrollRef}
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
      <Title close>{t('mealResult.title')}</Title>
      <Subtitle>{t('mealResult.editHint2')}</Subtitle>
      <AllergyBanner texts={items.map((i) => i.name)} />

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

      {(!!analysis.notes || !!analysis.sources?.length || analysis.source === 'off') && (
        <View style={styles.infoRow}>
          <Icon name="information-circle-outline" size={14} color={theme.textTertiary} />
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
            {/* Required credit: Open Food Facts is ODbL-licensed, so its data
                has to be attributed wherever it is shown. Products we read
                ourselves from a label are not OFF's and show nothing. */}
            {analysis.source === 'off' && (
              <Text
                onPress={() => Linking.openURL('https://world.openfoodfacts.org')}
                style={{ color: theme.textTertiary, fontSize: 12, textDecorationLine: 'underline' }}
              >
                {t('mealResult.offCredit')}
              </Text>
            )}
          </View>
        </View>
      )}

      {items.length === 0 && (
        <View style={[styles.emptyItems, { borderColor: theme.border }]}>
          <Icon name="fast-food-outline" size={28} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            {t('mealResult.noItems')}
          </Text>
        </View>
      )}

      {items.map((item, index) => (
        <Swipeable
          key={index}
          renderRightActions={() => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.remove')} onPress={() => removeItem(index)} style={styles.swipeDelete}>
              <Icon name="trash" size={22} color="#fff" />
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
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.remove')}
              onPress={() => removeItem(index)}
              hitSlop={8}
              style={({ pressed }) => [styles.itemDelete, pressed && { opacity: 0.5 }]}
            >
              <Icon name="trash-outline" size={20} color={theme.danger} />
            </Pressable>
          </View>
          <PortionControl item={item} onChange={(next) => replaceItem(index, next)} />
          <View style={styles.numRow}>
            <NumBox
              key={`c${item.portionMultiplier ?? ''}|${item.gramsEaten ?? ''}`}
              label={t('common.kcal')}
              value={item.calories}
              onChange={(v) => updateItem(index, { calories: v })}
            />
            <NumBox
              key={`p${item.portionMultiplier ?? ''}|${item.gramsEaten ?? ''}`}
              label={t('home.protein')}
              value={item.proteinG}
              onChange={(v) => updateItem(index, { proteinG: v })}
            />
            <NumBox
              key={`ca${item.portionMultiplier ?? ''}|${item.gramsEaten ?? ''}`}
              label={t('home.carbs')}
              value={item.carbsG}
              onChange={(v) => updateItem(index, { carbsG: v })}
            />
            <NumBox
              key={`f${item.portionMultiplier ?? ''}|${item.gramsEaten ?? ''}`}
              label={t('home.fat')}
              value={item.fatG}
              onChange={(v) => updateItem(index, { fatG: v })}
            />
          </View>
        </Card>
        </Swipeable>
      ))}

      {items.length > 0 && <RefineBox items={items} onResult={applyRefine} scrollRef={scrollRef} />}

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
