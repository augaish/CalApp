import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useViewDay } from '@/lib/day';
import { shareMeals } from '@/lib/meal-share';
import { usePending } from '@/lib/pending';
import { isSameDay, mealCalories, totalsForDay, useAppStore } from '@/lib/store';
import type { FastingSession, LoggedMeal, MealType } from '@/lib/types';

/** Xh Ym — same coarse-duration format the fasting screen itself uses. */
function formatHoursMinutes(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

/** The fasting card's one-line status — a plain function (not inlined in
 * JSX) since it reads the current time, which the React Compiler's purity
 * check only allows outside the component's own render body. */
function fastingCardLabel(
  activeFast: FastingSession | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!activeFast) return t('fasting.cardStart');
  const remainingMs = activeFast.targetHours * 3600000 - (Date.now() - new Date(activeFast.startedAt).getTime());
  return remainingMs <= 0 ? t('fasting.goalReached') : `${formatHoursMinutes(remainingMs)} ${t('fasting.cardRemaining')}`;
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function Food() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const meals = useAppStore((s) => s.meals);
  const targets = useAppStore((s) => s.targets);
  const removeMeal = useAppStore((s) => s.removeMeal);
  const updateMeal = useAppStore((s) => s.updateMeal);
  const activeFast = useAppStore((s) => s.activeFast);
  const selected = useViewDay((s) => s.day);
  const shift = useViewDay((s) => s.shift);

  const [sharing, setSharing] = useState(false);

  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const dayMeals = meals.filter((m) => isSameDay(m.at, selected));
  const totals = totalsForDay(meals, selected);

  const mealsOfType = (type: MealType): LoggedMeal[] =>
    dayMeals.filter((m) => (m.mealType ?? 'snack') === type);

  const dayLabel = selectedIsToday
    ? t('home.today')
    : selected.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const shareDay = async () => {
    setSharing(true);
    const outcome = await shareMeals(dayMeals, t('mealShare.dayHeading', { day: dayLabel }), t);
    setSharing(false);
    if (outcome === 'empty') Alert.alert(t('mealShare.empty'));
  };

  const confirmDelete = (id: string) =>
    Alert.alert(t('home.deleteMealConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeMeal(id) },
    ]);

  /**
   * A scan that finds several dishes (e.g. rice and chicken) still saves as
   * one LoggedMeal with several items — meal-edit already lists them
   * separately, so this list should too rather than collapsing them into one
   * joined-name row. Deleting the last remaining item deletes the meal.
   */
  const confirmDeleteItem = (meal: LoggedMeal, itemIndex: number) =>
    Alert.alert(t('home.deleteMealConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          const items = meal.items.filter((_, i) => i !== itemIndex);
          if (items.length === 0) removeMeal(meal.id);
          else updateMeal(meal.id, { items });
        },
      },
    ]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Ionicons name="restaurant" size={22} color={theme.text} />
        <Text style={[Type.title, { color: theme.text, flex: 1 }]}>{t('tabs.food')}</Text>
        <Pressable
          onPress={shareDay}
          disabled={sharing}
          hitSlop={10}
          style={{ opacity: sharing ? 0.4 : 1 }}
        >
          <Ionicons name="share-outline" size={20} color={theme.primary} />
        </Pressable>
        <View style={styles.dayNavGroup}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.arrow}>
            <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={() => router.push('/calendar')} hitSlop={6}>
            <Text style={[styles.dayLabel, { color: theme.text }]}>{dayLabel}</Text>
          </Pressable>
          <Pressable onPress={() => shift(1)} hitSlop={10} disabled={selectedIsToday} style={styles.arrow}>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={selectedIsToday ? theme.border : theme.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/fasting')}
        style={[styles.fastingCard, { backgroundColor: theme.cardSubtle }]}
      >
        <Ionicons name="timer-outline" size={20} color={theme.primary} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
          {fastingCardLabel(activeFast, t)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
      </Pressable>

      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
        {t('home.eaten')}:{' '}
        <Text style={{ color: theme.primary, fontWeight: '800' }}>
          {Math.round(totals.calories)}
        </Text>
        {targets ? ` / ${targets.calories} ${t('common.kcal')}` : ''}
      </Text>

      {dayMeals.length === 0 && (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="camera-outline" size={36} color={theme.textTertiary} />
          <Text style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            {t('home.noMeals')}
          </Text>
        </View>
      )}

      {MEAL_TYPES.map((type) => {
        const sectionMeals = mealsOfType(type);
        const sectionKcal = sectionMeals.reduce((sum, m) => sum + mealCalories(m), 0);
        return (
          <Card key={type}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionName, { color: theme.text }]}>
                {t(`home.mealTypes.${type}`)}
              </Text>
              {sectionKcal > 0 && (
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>
                  {Math.round(sectionKcal)} {t('common.kcal')}
                </Text>
              )}
              <Pressable
                onPress={() => {
                  usePending.getState().setMealTypeHint(type);
                  router.push('/add-menu?scope=food');
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.sectionAdd,
                  { backgroundColor: theme.cardSubtle },
                  pressed && { transform: [{ scale: 0.9 }] },
                ]}
              >
                <Ionicons name="add" size={18} color={theme.primary} />
              </Pressable>
            </View>
            {sectionMeals.map((meal) =>
              meal.items.map((item, itemIndex) => (
                <View key={`${meal.id}-${itemIndex}`} style={styles.mealRow}>
                  <Pressable
                    onPress={() => router.push(`/meal-edit?id=${encodeURIComponent(meal.id)}`)}
                    style={({ pressed }) => [styles.mealTap, pressed && { opacity: 0.6 }]}
                  >
                    <View style={[styles.mealAvatar, { backgroundColor: theme.cardSubtle }]}>
                      <Ionicons name="restaurant" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                        {new Date(meal.at).toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.mealKcal, { color: theme.primary }]}>
                      {Math.round(item.calories)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      meal.items.length > 1 ? confirmDeleteItem(meal, itemIndex) : confirmDelete(meal.id)
                    }
                    hitSlop={8}
                    style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
                  </Pressable>
                </View>
              )),
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fastingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dayNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    // Fixed LTR order: prevents RN's RTL row-mirroring from pointing the
    // static chevron glyphs the wrong way. See index.tsx headerCenter.
    direction: 'ltr',
  },
  arrow: { padding: 4 },
  dayLabel: { fontSize: 15, fontWeight: '700', minWidth: 64, textAlign: 'center' },
  empty: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionName: { flex: 1, fontSize: 17, fontWeight: '700' },
  sectionAdd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  mealTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mealAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  mealKcal: { fontSize: 17, fontWeight: '800' },
  deleteBtn: { padding: 4, marginStart: 4 },
});
