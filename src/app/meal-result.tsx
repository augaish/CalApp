import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';
import type { FoodItem } from '@/lib/types';

export default function MealResult() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const analysis = usePending((s) => s.meal);
  const photoUri = usePending((s) => s.photoUri);
  const clear = usePending((s) => s.clear);
  const logMeal = useAppStore((s) => s.logMeal);

  const [items, setItems] = useState<FoodItem[]>(analysis?.items ?? []);

  if (!analysis) {
    router.back();
    return null;
  }

  const updateItem = (index: number, patch: Partial<FoodItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const total = items.reduce((sum, i) => sum + i.calories, 0);

  const save = () => {
    logMeal(items, photoUri ?? undefined);
    clear();
    router.dismissAll();
  };

  return (
    <Screen>
      <Title>{t('mealResult.title')}</Title>
      <Subtitle>{t('mealResult.editHint')}</Subtitle>

      {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />}

      {analysis.confidence < 0.6 && (
        <Card style={{ borderColor: theme.warning }}>
          <Text style={{ color: theme.warning }}>{t('mealResult.lowConfidence')}</Text>
        </Card>
      )}

      {items.map((item, index) => (
        <Card key={index}>
          <View style={styles.itemHeader}>
            <Text style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
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

      <Card style={styles.totalCard}>
        <Text style={{ color: theme.textSecondary }}>{t('mealResult.totalCalories')}</Text>
        <Text style={[styles.totalValue, { color: theme.primary }]}>
          {Math.round(total)} {t('common.kcal')}
        </Text>
      </Card>

      <Button label={t('mealResult.logMeal')} onPress={save} />
      <Button
        label={t('common.cancel')}
        variant="ghost"
        onPress={() => {
          clear();
          router.back();
        }}
        style={{ marginTop: Spacing.sm }}
      />
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
  itemName: { fontSize: 17, fontWeight: '600', flex: 1 },
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
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalValue: { fontSize: 22, fontWeight: '800' },
});
