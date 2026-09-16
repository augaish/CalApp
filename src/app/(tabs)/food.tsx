import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { weekdayLabel } from '@/components/schedule-plan-card';
import { Card, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timestampFor, useViewDay } from '@/lib/day';
import { successHaptic } from '@/lib/feedback';
import { shareMeals } from '@/lib/meal-share';
import { usePending } from '@/lib/pending';
import {
  dateKey,
  isSameDay,
  mealCalories,
  plannedMealCalories,
  plannedMealFor,
  plannedMealOptions,
  totalsForDay,
  useAppStore,
} from '@/lib/store';
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
  const logMeal = useAppStore((s) => s.logMeal);
  const activeFast = useAppStore((s) => s.activeFast);
  const mealPlan = useAppStore((s) => s.activeProgram?.mealPlan);
  const activeProgramId = useAppStore((s) => s.activeProgram?.id);
  const mealPlanSwaps = useAppStore((s) => s.mealPlanSwaps);
  const swapPlannedMeal = useAppStore((s) => s.swapPlannedMeal);
  const mealPlanRecipes = useAppStore((s) => s.mealPlanRecipes);
  const recipes = useAppStore((s) => s.recipes);
  const selected = useViewDay((s) => s.day);
  const shift = useViewDay((s) => s.shift);

  const [sharing, setSharing] = useState(false);
  // Which slot has its swap chooser open, and the last plan meal logged
  // from this screen (so the row can offer Undo for a few seconds).
  const [swapping, setSwapping] = useState<MealType | null>(null);
  const [justLogged, setJustLogged] = useState<{ slot: MealType; mealId: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logPlanned = (slot: MealType) => {
    const planned = plannedMealFor(mealPlan, selected, slot, mealPlanSwaps, mealPlanRecipes, recipes, activeProgramId);
    if (!planned) return;
    // Copies, so a later edit of the logged meal never reaches into the plan.
    logMeal(planned.items.map((i) => ({ ...i })), undefined, slot, timestampFor(selected));
    // logMeal prepends, so the newest meal is the one just written.
    const mealId = useAppStore.getState().meals[0]?.id;
    successHaptic();
    if (!mealId) return;
    setJustLogged({ slot, mealId });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setJustLogged(null), 8000);
  };

  const undoPlanned = () => {
    if (!justLogged) return;
    removeMeal(justLogged.mealId);
    setJustLogged(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

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

      <View style={styles.eatenRow}>
        <Text style={{ color: theme.textSecondary, flex: 1 }}>
          {t('home.eaten')}:{' '}
          <Text style={{ color: theme.primary, fontWeight: '800' }}>
            {Math.round(totals.calories)}
          </Text>
          {targets ? ` / ${targets.calories} ${t('common.kcal')}` : ''}
        </Text>
        {mealPlan && (
          <Pressable onPress={() => router.push('/program')} hitSlop={8} style={styles.planLink}>
            <Ionicons name="calendar-outline" size={14} color={theme.primary} />
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
              {t('mealPlan.viewPlan')}
            </Text>
          </Pressable>
        )}
      </View>

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
        // The plan's meal for this slot stays visible until something is
        // logged here (whatever it was — a scan of the same dish counts),
        // plus a beat longer for Undo right after "Log eaten".
        const planned = plannedMealFor(mealPlan, selected, type, mealPlanSwaps, mealPlanRecipes, recipes, activeProgramId);
        const showPlanned = planned && (sectionMeals.length === 0 || justLogged?.slot === type);
        const swapOptions = mealPlan && swapping === type ? plannedMealOptions(mealPlan, type) : [];
        const swappedFrom = mealPlanSwaps[dateKey(selected)]?.[type];
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
            {showPlanned && planned && (
              <View style={[styles.plannedBox, { backgroundColor: theme.cardSubtle }]}>
                <View style={styles.plannedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                      {t('mealPlan.planned')}
                      {swappedFrom != null ? ` · ${weekdayLabel(swappedFrom, locale)}` : ''}
                    </Text>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                      {planned.name}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      {Math.round(plannedMealCalories(planned))} {t('common.kcal')}
                      {' · '}
                      {planned.items.map((i) => i.name).join(', ')}
                    </Text>
                  </View>
                </View>
                {justLogged?.slot === type ? (
                  <View style={styles.plannedActions}>
                    <View style={[styles.plannedBtn, { flex: 1 }]}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                      <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('mealPlan.logged')}</Text>
                    </View>
                    <Pressable
                      onPress={undoPlanned}
                      style={({ pressed }) => [styles.plannedBtn, { backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="arrow-undo" size={16} color={theme.text} />
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('mealPlan.undo')}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.plannedActions}>
                    <Pressable
                      onPress={() => setSwapping(swapping === type ? null : type)}
                      style={({ pressed }) => [styles.plannedBtn, { backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="swap-horizontal" size={16} color={theme.text} />
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('mealPlan.swap')}</Text>
                    </Pressable>
                    {/* Two different questions: "swap" takes another day's
                        meal for this slot, "cook" turns this slot into a
                        recipe you can actually make. */}
                    <Pressable
                      onPress={() => {
                        const fromRecipe = planned.items[0]?.recipeId;
                        router.push(
                          fromRecipe
                            ? `/recipe?id=${encodeURIComponent(fromRecipe)}&day=${dateKey(selected)}&slot=${type}`
                            : `/recipes?day=${dateKey(selected)}&slot=${type}`,
                        );
                      }}
                      style={({ pressed }) => [styles.plannedBtn, { backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="restaurant" size={16} color={theme.text} />
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                        {planned.items[0]?.recipeId ? t('mealPlan.viewRecipe') : t('mealPlan.addRecipe')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => logPlanned(type)}
                      style={({ pressed }) => [styles.plannedBtn, { flex: 1, backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
                    >
                      <Ionicons name="checkmark" size={16} color={theme.onPrimary} />
                      <Text style={{ color: theme.onPrimary, fontWeight: '700', fontSize: 13 }}>{t('mealPlan.logEaten')}</Text>
                    </Pressable>
                  </View>
                )}
                {swapping === type && (
                  <View style={styles.swapList}>
                    {swapOptions.map(({ weekday, meal }) => {
                      const active = meal.name === planned.name;
                      return (
                        <Pressable
                          key={weekday}
                          onPress={() => {
                            swapPlannedMeal(dateKey(selected), type, weekday === selected.getDay() ? null : weekday);
                            setSwapping(null);
                          }}
                          style={({ pressed }) => [
                            styles.swapRow,
                            { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.card },
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                              {meal.name}
                            </Text>
                            <Text style={{ color: theme.textTertiary, fontSize: 11 }}>
                              {weekdayLabel(weekday, locale)} · {Math.round(plannedMealCalories(meal))} {t('common.kcal')}
                            </Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={16} color={theme.primary} />}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            {sectionMeals.map((meal) =>
              meal.items.map((item, itemIndex) => (
                <View key={`${meal.id}-${itemIndex}`} style={styles.mealRow}>
                  <Pressable
                    onPress={() =>
                      // Something cooked from a recipe has a portion to correct;
                      // anything else opens the ordinary editor.
                      router.push(
                        item.recipeId
                          ? `/edit-portion?id=${encodeURIComponent(meal.id)}&index=${itemIndex}`
                          : `/meal-edit?id=${encodeURIComponent(meal.id)}`,
                      )
                    }
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
  eatenRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  planLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  plannedBox: { borderRadius: Radius.md, padding: Spacing.sm, marginTop: Spacing.sm, gap: Spacing.sm },
  plannedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  plannedActions: { flexDirection: 'row', gap: 6 },
  plannedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: Radius.full,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minHeight: 38,
  },
  swapList: { gap: 6 },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
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
