import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, MealTypePicker, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { timestampFor, useViewDay } from '@/lib/day';
import { successHaptic } from '@/lib/feedback';
import { usePending } from '@/lib/pending';
import { mealTypeForNow, useAppStore } from '@/lib/store';
import type { FoodItem, MealType } from '@/lib/types';

export default function MealResult() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const analysis = usePending((s) => s.meal);
  const photoUri = usePending((s) => s.photoUri);
  const logMeal = useAppStore((s) => s.logMeal);
  const viewDay = useViewDay((s) => s.day);

  const [items, setItems] = useState<FoodItem[]>(analysis?.items ?? []);
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());

  useEffect(() => {
    if (!analysis && router.canGoBack()) router.back();
  }, [analysis, router]);

  if (!analysis) return null;

  const updateItem = (index: number, patch: Partial<FoodItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const total = items.reduce((sum, i) => sum + i.calories, 0);

  // Note: pending data is NOT cleared on close — clearing re-renders this
  // screen with empty state and double-fires the back navigation. The next
  // scan simply overwrites it.
  // Land on the Food tab so the user sees the meal appear in their log.
  const save = () => {
    logMeal(items, photoUri ?? undefined, mealType, timestampFor(viewDay));
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
      <Subtitle>{t('mealResult.editHint')}</Subtitle>

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

      {items.map((item, index) => (
        <Card key={index}>
          <View style={styles.itemHeader}>
            <TextInput
              defaultValue={item.name}
              onChangeText={(text) => updateItem(index, { name: text })}
              style={[styles.itemNameInput, { color: theme.text, borderColor: theme.border }]}
            />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{item.portion}</Text>
          </View>
          <View style={styles.numRow}>
            <NumBox
              label={t('common.kcal')}
              value={item.calories}
              onChange={(v) => updateItem(index, { calories: v })}
            />
            <NumBox
              label={t('home.protein')}
              value={item.proteinG}
              onChange={(v) => updateItem(index, { proteinG: v })}
            />
            <NumBox
              label={t('home.carbs')}
              value={item.carbsG}
              onChange={(v) => updateItem(index, { carbsG: v })}
            />
            <NumBox
              label={t('home.fat')}
              value={item.fatG}
              onChange={(v) => updateItem(index, { fatG: v })}
            />
          </View>
        </Card>
      ))}

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
        onChangeText={(text) => onChange(parseInt(text, 10) || 0)}
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
});
