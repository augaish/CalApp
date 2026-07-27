import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, MealTypePicker, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';
import type { FoodItem, MealType } from '@/lib/types';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Stamp a chosen day with the meal's original clock time. */
function stampDay(day: Date, from: string): string {
  const t = new Date(from);
  const d = new Date(day);
  d.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), 0);
  return d.toISOString();
}

export default function MealEdit() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const { id } = useLocalSearchParams<{ id?: string }>();

  const meal = useAppStore((s) => s.meals.find((m) => m.id === id));
  const updateMeal = useAppStore((s) => s.updateMeal);
  const duplicateMeal = useAppStore((s) => s.duplicateMeal);

  const [items, setItems] = useState<FoodItem[]>(() => (meal ? meal.items.map((i) => ({ ...i })) : []));
  const [mealType, setMealType] = useState<MealType>(meal?.mealType ?? 'snack');
  const [day, setDay] = useState<Date>(() => (meal ? new Date(meal.at) : new Date()));

  if (!meal) {
    return (
      <Screen>
        <Title>{t('mealEdit.title')}</Title>
        <Text style={{ color: theme.textSecondary }}>{t('mealEdit.notFound')}</Text>
        <Button label={t('common.close')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const updateItem = (index: number, patch: Partial<FoodItem>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        // Editing a macro by hand breaks the auto-scale link.
        if ('calories' in patch || 'proteinG' in patch || 'carbsG' in patch || 'fatG' in patch) {
          delete next.basePer100;
        }
        return next;
      }),
    );
  };

  const shiftDay = (delta: number) => {
    setDay((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      if (d.getTime() > Date.now()) return prev; // no future
      return d;
    });
  };

  const isToday = sameDay(day, new Date());

  const save = () => {
    updateMeal(meal.id, { items, mealType, at: stampDay(day, meal.at) });
    successHaptic();
    useCelebrate.getState().celebrate(t('mealEdit.saved'));
    router.back();
  };

  const duplicate = () => {
    duplicateMeal(meal.id, stampDay(day, meal.at), mealType);
    successHaptic();
    useCelebrate.getState().celebrate(t('mealEdit.duplicated'));
    router.back();
  };

  const total = items.reduce((sum, i) => sum + i.calories, 0);

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
          <Button label={t('mealEdit.save')} onPress={save} />
          <Button
            label={t('mealEdit.duplicate')}
            icon="copy-outline"
            variant="secondary"
            onPress={duplicate}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title>{t('mealEdit.title')}</Title>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Subtitle>{t('mealEdit.hint')}</Subtitle>

      {/* Move to meal type */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
        {t('mealResult.mealType')}
      </Text>
      <MealTypePicker value={mealType} onChange={setMealType} />

      {/* Move to day */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
        {t('mealEdit.day')}
      </Text>
      <View style={[styles.dayRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable onPress={() => shiftDay(-1)} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
        </Pressable>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
          {isToday
            ? t('home.today')
            : day.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
        </Text>
        <Pressable onPress={() => shiftDay(1)} hitSlop={10} disabled={isToday} style={styles.arrow}>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={isToday ? theme.border : theme.textSecondary}
          />
        </Pressable>
      </View>

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
            <NumBox label={t('common.kcal')} value={item.calories} onChange={(v) => updateItem(index, { calories: v })} />
            <NumBox label={t('home.protein')} value={item.proteinG} onChange={(v) => updateItem(index, { proteinG: v })} />
            <NumBox label={t('home.carbs')} value={item.carbsG} onChange={(v) => updateItem(index, { carbsG: v })} />
            <NumBox label={t('home.fat')} value={item.fatG} onChange={(v) => updateItem(index, { fatG: v })} />
          </View>
        </Card>
      ))}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.md,
    direction: 'ltr',
  },
  arrow: { padding: 4 },
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
});
