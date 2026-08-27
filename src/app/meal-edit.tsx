import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RefineBox } from '@/components/refine-box';
import { Button, Card, MealTypePicker, Screen, Subtitle, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';
import { useViewDay } from '@/lib/day';
import { successHaptic } from '@/lib/feedback';
import { shareMeals } from '@/lib/meal-share';
import { normalizeDigits } from '@/lib/numbers';
import { useAppStore } from '@/lib/store';
import type { FoodItem, MealAnalysis, MealType } from '@/lib/types';

const PORTIONS: { m: number; label: string }[] = [
  { m: 0.25, label: '¼' },
  { m: 0.5, label: '½' },
  { m: 1, label: '1' },
  { m: 1.5, label: '1½' },
  { m: 2, label: '2' },
];

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
  const removeMeal = useAppStore((s) => s.removeMeal);
  const duplicateMeal = useAppStore((s) => s.duplicateMeal);
  const setViewDay = useViewDay((s) => s.setDay);

  const [items, setItems] = useState<FoodItem[]>(() => (meal ? meal.items.map((i) => ({ ...i })) : []));
  const [mealType, setMealType] = useState<MealType>(meal?.mealType ?? 'snack');
  const [day, setDay] = useState<Date>(() => (meal ? new Date(meal.at) : new Date()));
  // Baseline macros captured at open (treated as the ×1 portion), so portion
  // scaling works on any saved record — not just freshly-scanned ones.
  const [baseSnap, setBaseSnap] = useState(() =>
    (meal ? meal.items : []).map((i) => ({
      calories: i.calories,
      proteinG: i.proteinG,
      carbsG: i.carbsG,
      fatG: i.fatG,
    })),
  );
  const [mults, setMults] = useState<number[]>(() => (meal ? meal.items.map((i) => i.portionMultiplier ?? 1) : []));
  const [sharing, setSharing] = useState(false);

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
          delete next.portionMultiplier;
        }
        return next;
      }),
    );
  };

  // Portion multiplier for AI/manual items — scales from the opened baseline.
  const setPortion = (index: number, m: number) => {
    const b = baseSnap[index];
    if (!b) return;
    setMults((prev) => prev.map((v, i) => (i === index ? m : v)));
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              portionMultiplier: m,
              calories: Math.round(b.calories * m),
              proteinG: Math.round(b.proteinG * m),
              carbsG: Math.round(b.carbsG * m),
              fatG: Math.round(b.fatG * m),
            }
          : item,
      ),
    );
  };

  // Grams-based scaling for barcode / packaged records.
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

  /**
   * Drop a food the scan got wrong. The portion chips only go down to a
   * quarter, so without this there was no way to say "I did not eat that" —
   * the item and its calories were stuck in the meal.
   */
  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setMults((prev) => prev.filter((_, i) => i !== index));
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
  const dayLabel = isToday
    ? t('home.today')
    : day.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  // After any action, jump the Food tab to the affected day so the result is
  // visible immediately (otherwise a copy made on "today" is hidden behind the
  // day you were viewing).
  const finish = (target: Date, message: string) => {
    successHaptic();
    useCelebrate.getState().celebrate(message);
    setViewDay(target);
    router.dismissTo('/(tabs)/food');
  };

  const save = () => {
    // Every food removed is a request to delete the meal, not to keep an empty
    // one sitting at 0 kcal.
    if (items.length === 0) {
      removeMeal(meal.id);
      finish(day, t('mealEdit.removedMeal'));
      return;
    }
    updateMeal(meal.id, { items, mealType, at: stampDay(day, meal.at) });
    finish(day, t('mealEdit.saved'));
  };

  // Duplicate to an explicit target day (keeps the original untouched).
  const duplicateTo = (target: Date) => {
    duplicateMeal(meal.id, stampDay(target, meal.at), mealType);
    finish(target, t('mealEdit.duplicated'));
  };

  // A refine correction returns the whole item list fresh — it becomes the
  // new ×1 baseline for portion scaling, same as reopening a different meal.
  const applyRefine = (result: MealAnalysis) => {
    setItems(result.items.map((it) => ({ ...it })));
    setBaseSnap(
      result.items.map((it) => ({
        calories: it.calories,
        proteinG: it.proteinG,
        carbsG: it.carbsG,
        fatG: it.fatG,
      })),
    );
    setMults(result.items.map(() => 1));
  };

  const total = items.reduce((sum, i) => sum + i.calories, 0);

  // Shares what is on screen, not what is saved, so a portion the user just
  // adjusted is the number their friend receives.
  const share = async () => {
    setSharing(true);
    const outcome = await shareMeals(
      [{ ...meal, items, mealType }],
      t('mealShare.mealHeading', { meal: t(`home.mealTypes.${mealType}`) }),
      t,
    );
    setSharing(false);
    if (outcome === 'empty') Alert.alert(t('mealShare.empty'));
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
          <Button
            label={items.length === 0 ? t('mealEdit.deleteMeal') : t('mealEdit.save')}
            onPress={save}
          />
          {items.length > 0 && (
            <Button
              label={t('mealEdit.duplicateTo', { day: dayLabel })}
              icon="copy-outline"
              variant="secondary"
              onPress={() => duplicateTo(day)}
              style={{ marginTop: Spacing.xs }}
            />
          )}
        </View>
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title>{t('mealEdit.title')}</Title>
        </View>
        {items.length > 0 && (
          <Pressable
            onPress={share}
            disabled={sharing}
            hitSlop={10}
            style={{ marginEnd: Spacing.sm, opacity: sharing ? 0.4 : 1 }}
          >
            <Ionicons name="share-outline" size={20} color={theme.primary} />
          </Pressable>
        )}
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

      {/* Move / duplicate target day */}
      <View style={styles.dayHeaderRow}>
        <Text style={[Type.caption, { color: theme.textSecondary, flex: 1 }]}>
          {t('mealEdit.day')}
        </Text>
        {!isToday && (
          <Pressable onPress={() => setDay(new Date())} hitSlop={8}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
              {t('mealEdit.jumpToday')}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.dayRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable onPress={() => shiftDay(-1)} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
        </Pressable>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{dayLabel}</Text>
        <Pressable onPress={() => shiftDay(1)} hitSlop={10} disabled={isToday} style={styles.arrow}>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={isToday ? theme.border : theme.textSecondary}
          />
        </Pressable>
      </View>

      {items.length === 0 && (
        <View style={[styles.emptyNote, { borderColor: theme.border }]}>
          <Ionicons name="information-circle-outline" size={20} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, flex: 1, fontSize: 13 }}>
            {t('mealEdit.emptyHint')}
          </Text>
        </View>
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
            <Pressable
              onPress={() => removeItem(index)}
              hitSlop={10}
              style={({ pressed }) => [styles.removeItemBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
            </Pressable>
          </View>

          {item.basePer100 ? (
            <View style={[styles.gramsRow, { backgroundColor: theme.cardSubtle }]}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                {t('mealResult.amountEaten')}
              </Text>
              <TextInput
                defaultValue={String(Math.round(item.gramsEaten ?? 100))}
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={(text) => setGrams(index, parseInt(normalizeDigits(text), 10) || 0)}
                style={[styles.gramsInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              />
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{t('common.grams')}</Text>
            </View>
          ) : (
            <View style={styles.portionRow}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600', marginEnd: 4 }}>
                {t('mealResult.portion')}
              </Text>
              {PORTIONS.map(({ m, label }) => {
                const active = Math.abs((mults[index] ?? 1) - m) < 0.001;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setPortion(index, m)}
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

          <View style={styles.numRow}>
            <NumBox key={`c${item.gramsEaten ?? ''}${mults[index] ?? ''}`} label={t('common.kcal')} value={item.calories} onChange={(v) => updateItem(index, { calories: v })} />
            <NumBox key={`p${item.gramsEaten ?? ''}${mults[index] ?? ''}`} label={t('home.protein')} value={item.proteinG} onChange={(v) => updateItem(index, { proteinG: v })} />
            <NumBox key={`ca${item.gramsEaten ?? ''}${mults[index] ?? ''}`} label={t('home.carbs')} value={item.carbsG} onChange={(v) => updateItem(index, { carbsG: v })} />
            <NumBox key={`f${item.gramsEaten ?? ''}${mults[index] ?? ''}`} label={t('home.fat')} value={item.fatG} onChange={(v) => updateItem(index, { fatG: v })} />
          </View>
        </Card>
      ))}

      {items.length > 0 && <RefineBox items={items} onResult={applyRefine} />}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
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
  removeItemBtn: { padding: 2 },
  emptyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: Spacing.md,
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
});
