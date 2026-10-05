import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Icon } from '@/components/icon';
import { ModuleBanner } from '@/components/plan-status';
import { alertDestructive } from '@/lib/alerts';
import { HeaderPill } from '@/components/brand-header';
import { CollapsingScreen } from '@/components/collapsing-screen';
import { illustrationFor, PhotoFallback } from '@/components/photo-fallback';
import { weekdayLabel } from '@/components/schedule-plan-card';
import {
  ActionButton,
  DayStrip,
  EmptyState,
  IconTile,
  MacroRow,
  ProgressTrack,
  RowGroup,
  SectionTitle,
  Segmented,
  SettingsRow,
  StatusPill,
} from '@/components/system';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timestampFor, useViewDay } from '@/lib/day';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { shareMeals } from '@/lib/meal-share';
import { usePending } from '@/lib/pending';
import { isEstimated, itemUnknownNutrients, knownLabel, portionText } from '@/lib/recipes';
import {
  dateKey,
  isSameDay,
  mealCalories,
  plannedMealCalories,
  plannedMealFor,
  plannedMealOptions,
  plannedRecipeMealsBetween,
  totalsForDay,
  useAppStore,
} from '@/lib/store';
import type { FastingSession, LoggedMeal, MealType, NutrientKey } from '@/lib/types';
import { useTourTarget } from '@/lib/tour';
import { useAllRecipes } from '@/lib/use-recipes';

/** Xh Ym — same coarse-duration format the fasting screen itself uses. */
function formatHoursMinutes(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

/** The fasting row's one-line status — a plain function (not inlined in
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

/** The week (Sunday-first, as the Gulf week runs) that contains a day. */
function weekOf(day: Date): Date[] {
  const start = new Date(day);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** A planned meal whose calories are a known subtotal (a recipe with unrecorded nutrition). */
const plannedKcalUnknown = (meal: { items: { nutritionIncomplete?: true; incompleteNutrients?: NutrientKey[] }[] }) =>
  meal.items.some((i) => itemUnknownNutrients(i).includes('calories'));

/**
 * S02 Food — the day's diary (Today) and the day's plan (Meal plan) as local
 * tabs over the same date. Eaten totals come from actual entries only;
 * planned food is visibly separate and never counted as eaten.
 */
export default function Food() {
  const { t, i18n } = useTranslation();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
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
  // The plan's owner label: an accepted programme, otherwise the person's own.
  const programName = activeProgramId ? t('program.title') : undefined;
  const mealPlanSwaps = useAppStore((s) => s.mealPlanSwaps);
  const swapPlannedMeal = useAppStore((s) => s.swapPlannedMeal);
  const mealPlanRecipes = useAppStore((s) => s.mealPlanRecipes);
  const recipes = useAllRecipes();
  const shopping = useAppStore((s) => s.shopping);
  const selected = useViewDay((s) => s.day);
  const tilesTarget = useTourTarget('food.tiles');

  const [sharing, setSharing] = useState(false);
  // Today / Meal plan are local views (S02). A deep link can open the plan
  // directly (Shopping's "Plan meals" does); a tap here wins afterwards.
  const [tabOverride, setTabOverride] = useState<'today' | 'plan' | null>(null);
  const tab: 'today' | 'plan' = tabOverride ?? (tabParam === 'plan' ? 'plan' : 'today');
  // The plan can look ahead; the diary cannot (S11.select_date is view state).
  const [planDayOverride, setPlanDayOverride] = useState<Date | null>(null);
  const planDay = planDayOverride ?? selected;
  // Which slot has its swap chooser open, and the last plan meal logged
  // from this screen (so the row can offer Undo for a few seconds).
  const [swapping, setSwapping] = useState<MealType | null>(null);
  const [justLogged, setJustLogged] = useState<{ slot: MealType; mealId: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logPlanned = (slot: MealType, day: Date) => {
    const planned = plannedMealFor(mealPlan, day, slot, mealPlanSwaps, mealPlanRecipes, recipes, activeProgramId);
    if (!planned) return;
    // Copies, so a later edit of the logged meal never reaches into the plan.
    logMeal(planned.items.map((i) => ({ ...i })), undefined, slot, timestampFor(day));
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
  const incomplete = totals.incomplete ?? [];
  const kcalIncomplete = incomplete.includes('calories');
  const remaining = (targets?.calories ?? 0) - totals.calories;
  const num = (n: number) => Math.round(n).toLocaleString(locale);

  const mealsOfType = (type: MealType): LoggedMeal[] => dayMeals.filter((m) => (m.mealType ?? 'snack') === type);

  const dayLabel = selectedIsToday ? t('home.today') : selected.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const shortDate = selected.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const shareDay = async () => {
    setSharing(true);
    const outcome = await shareMeals(dayMeals, t('mealShare.dayHeading', { day: dayLabel }), t);
    setSharing(false);
    if (outcome === 'empty') Alert.alert(t('mealShare.empty'));
  };

  const confirmDelete = (id: string) =>
    alertDestructive(t('home.deleteMealConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeMeal(id) },
    ]);

  /** A scan that finds several dishes still saves as one LoggedMeal with
   * several items; each is its own row, and deleting the last deletes the meal. */
  const confirmDeleteItem = (meal: LoggedMeal, itemIndex: number) =>
    alertDestructive(t('home.deleteMealConfirm'), undefined, [
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

  // Swipe a row left and tap Delete: gone straight away, with a few seconds
  // to undo instead of a question first. Long press still asks.
  const [deleted, setDeleted] = useState<{ meal: LoggedMeal; index: number; whole: boolean; name: string } | null>(null);
  const deletedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteRow = (meal: LoggedMeal, itemIndex: number) => {
    const index = useAppStore.getState().meals.findIndex((m) => m.id === meal.id);
    const whole = meal.items.length <= 1;
    if (whole) removeMeal(meal.id);
    else updateMeal(meal.id, { items: meal.items.filter((_, i) => i !== itemIndex) });
    lightHaptic();
    setDeleted({ meal, index, whole, name: meal.items[itemIndex]?.name ?? '' });
    if (deletedTimer.current) clearTimeout(deletedTimer.current);
    deletedTimer.current = setTimeout(() => setDeleted(null), 6000);
  };
  const undoDelete = () => {
    if (!deleted) return;
    if (deleted.whole) useAppStore.getState().restoreMeal(deleted.meal, deleted.index);
    else updateMeal(deleted.meal.id, { items: deleted.meal.items });
    setDeleted(null);
    if (deletedTimer.current) clearTimeout(deletedTimer.current);
    successHaptic();
  };

  // Back on Food after logging something elsewhere (scan, search, quick add):
  // say where it went, light the row up, and offer Undo for a few seconds.
  // Only one new meal counts, so a sync bringing in several stays quiet.
  const [added, setAdded] = useState<{ mealId: string; slot: MealType } | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  useFocusEffect(
    useCallback(() => {
      const before = seenIds.current;
      const now = useAppStore.getState().meals;
      if (before) {
        const fresh = now.filter((m) => !before.has(m.id));
        if (fresh.length === 1) {
          setAdded({ mealId: fresh[0].id, slot: fresh[0].mealType ?? 'snack' });
          if (addedTimer.current) clearTimeout(addedTimer.current);
          addedTimer.current = setTimeout(() => setAdded(null), 6000);
        }
      }
      return () => {
        seenIds.current = new Set(useAppStore.getState().meals.map((m) => m.id));
      };
    }, []),
  );
  const undoAdded = () => {
    if (!added) return;
    removeMeal(added.mealId);
    setAdded(null);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    lightHaptic();
  };

  const openLog = (slot: MealType) => {
    usePending.getState().setMealTypeHint(slot);
    router.push('/add-menu?scope=food');
  };
  const recipeFor = (recipeId?: string) => (recipeId ? recipes.find((r) => r.id === recipeId) : undefined);

  // Plan-week coverage for the Shopping row (S11.shopping / S12 coverage).
  const planWeek = useMemo(() => weekOf(planDay), [planDay]);
  const coverage = useMemo(
    () =>
      plannedRecipeMealsBetween(dateKey(planWeek[0]), dateKey(planWeek[6]), mealPlanRecipes, recipes, mealPlan, activeProgramId),
    [planWeek, mealPlanRecipes, recipes, mealPlan, activeProgramId],
  );

  // The brand row keeps the Calgym logo, AI Support and Profile like every
  // root screen (C02); the date control gets its own compact row beneath
  // rather than crowding the brand out, and the whole band scrolls away.
  const header = (
    <View style={styles.dateRow}>
      <HeaderPill
        icon="calendar-outline"
        label={selectedIsToday ? t('home.today') : shortDate}
        trailing="chevron-down"
        onPress={() => router.push('/calendar')}
        accessibilityLabel={t('food.chooseDay')}
      />
    </View>
  );
  // Today / Meal plan live in the band and stay in the sticky bar (S02), so
  // they can never slide under the header again.
  const tabs = (
    <View style={[styles.segmentWrap, { backgroundColor: theme.card }]}>
      <Segmented
        options={[
          { key: 'today', label: t('food.tabToday') },
          { key: 'plan', label: t('food.tabPlan') },
        ]}
        value={tab}
        onChange={setTabOverride}
      />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
    <CollapsingScreen
      title={t('tabs.food')}
      header={header}
      sticky={tabs}
      stickyTourKey="food.tabs"
      footer={
        tab === 'plan' ? (
          <Button
            label={t('food.addMeal')}
            icon="add"
            onPress={() => {
              const empty = MEAL_TYPES.find(
                (s) => !plannedMealFor(mealPlan, planDay, s, mealPlanSwaps, mealPlanRecipes, recipes, activeProgramId),
              );
              router.push(`/recipes?day=${dateKey(planDay)}&slot=${empty ?? 'snack'}`);
            }}
          />
        ) : undefined
      }
    >
      <ModuleBanner area="food" />
      {tab === 'plan' ? (
        <>
          <View style={styles.planHead}>
            <Text style={[Type.section, { color: theme.text }]}>
              {t('food.tabPlan')}
              <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: '600' }}> · {programName || t('today.myPlan')}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
              {planDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <DayStrip days={planWeek} selected={planDay} onSelect={setPlanDayOverride} locale={locale} />
          <PlanDay
            day={planDay}
            eaten={totalsForDay(meals, planDay).calories}
            target={targets?.calories}
            hasProgram={!!mealPlan}
            slotMeal={(slot) => plannedMealFor(mealPlan, planDay, slot, mealPlanSwaps, mealPlanRecipes, recipes, activeProgramId)}
            swapOptions={(slot) => (mealPlan ? plannedMealOptions(mealPlan, slot) : [])}
            swappedFrom={(slot) => mealPlanSwaps[dateKey(planDay)]?.[slot]}
            onSwap={(slot, weekday) => swapPlannedMeal(dateKey(planDay), slot, weekday === planDay.getDay() ? null : weekday)}
            onLog={(slot) => logPlanned(slot, planDay)}
            recipeFor={recipeFor}
            coverage={coverage}
            swapping={swapping}
            setSwapping={setSwapping}
            locale={locale}
          />
        </>
      ) : (
        <>
          {/* Eaten today — actual records only. */}
          <View
            style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}
            accessibilityLabel={selectedIsToday ? t('food.eatenToday') : undefined}
          >
            {/* Today needs no heading: the tab and date already say so. */}
            {!selectedIsToday && (
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>{t('food.eatenOn', { day: shortDate })}</Text>
            )}
            <View style={styles.kcalRow}>
              <Text style={{ color: theme.text }}>
                <Text style={{ fontSize: 26, fontWeight: '800' }}>{kcalIncomplete ? '≥' : ''}{num(totals.calories)}</Text>
                {targets && (
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}>
                    {' '}/ {num(targets.calories)} {t('common.kcal')}
                  </Text>
                )}
              </Text>
              {targets && (
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  {remaining < 0 ? t('today.overBy', { n: num(-remaining) }) : kcalIncomplete ? t('today.leftAtMost', { n: num(remaining) }) : t('today.left', { n: num(remaining) })}
                </Text>
              )}
            </View>
            {targets && <ProgressTrack value={totals.calories} max={targets.calories} approx={kcalIncomplete} />}
            <MacroRow
              values={totals}
              targets={targets}
              unknown={incomplete}
              labels={{ protein: t('home.protein'), carbs: t('home.carbs'), fat: t('home.fat') }}
              unit={t('common.grams')}
            />
            {incomplete.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.sm }}>
                <StatusPill label={t('mealPlan.incomplete')} tone="review" icon="alert-circle-outline" />
                <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>{t('food.incompleteNote')}</Text>
              </View>
            )}
          </View>

          <SectionTitle
            action={selectedIsToday ? { label: t('home.scanMeal'), icon: 'camera-outline', onPress: () => router.push('/scan?mode=meal') } : undefined}
          >
            {selectedIsToday ? t('food.todaysMeals') : t('food.mealsOn', { day: shortDate })}
          </SectionTitle>

          {MEAL_TYPES.map((type) => {
            const sectionMeals = mealsOfType(type);
            const sectionKcal = sectionMeals.reduce((sum, m) => sum + mealCalories(m), 0);
            // The plan's meal for this slot stays visible until something is
            // logged here, plus a beat longer for Undo right after "Log eaten".
            const planned = plannedMealFor(mealPlan, selected, type, mealPlanSwaps, mealPlanRecipes, recipes, activeProgramId);
            const showPlanned = planned && (sectionMeals.length === 0 || justLogged?.slot === type);
            const plannedRecipe = recipeFor(planned?.items[0]?.recipeId);
            const key = dateKey(selected);
            const slotLabel = t(`home.mealTypes.${type}`);

            if (showPlanned && planned) {
              const rid = planned.items[0]?.recipeId;
              return (
                <View key={type} style={[styles.plannedCard, { backgroundColor: theme.surfaceTint }]}>
                  <View style={styles.rowTop}>
                    <PhotoFallback uri={plannedRecipe?.photoUri} illustration={illustrationFor(planned.name)} size={64} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.eyebrowRow}>
                        <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{slotLabel}</Text>
                        <StatusPill label={t('mealPlan.planned')} tone="planned" />
                      </View>
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }} numberOfLines={2}>
                        {planned.name}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                        {planned.items.length === 1 && portionText(planned.items[0], t) ? `${portionText(planned.items[0], t)} · ` : ''}
                        {knownLabel(num(plannedMealCalories(planned)), plannedKcalUnknown(planned))} {t('common.kcal')}
                      </Text>
                      {(plannedRecipe ? isEstimated(plannedRecipe) : false) && (
                        <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('recipe.estimated')}</Text>
                      )}
                    </View>
                  </View>
                  {justLogged?.slot === type ? (
                    <View style={styles.actions}>
                      <View style={[styles.loggedNote, { flex: 1 }]}>
                        <Icon name="checkmark-circle" size={16} color={theme.successText} />
                        <Text style={{ color: theme.successText, fontWeight: '700', fontSize: 13 }}>{t('mealPlan.logged')}</Text>
                      </View>
                      <ActionButton label={t('mealPlan.undo')} icon="arrow-undo" variant="secondary" onPress={undoPlanned} />
                    </View>
                  ) : (
                    // The primary action owns a full row so its label is never
                    // clipped in either language; secondary actions sit underneath.
                    <View style={styles.actionStack}>
                      <ActionButton
                        label={t('mealPlan.logEaten')}
                        onPress={() => {
                          // A recipe-backed meal has a portion to review (S13);
                          // a programme meal without one logs as planned, with Undo.
                          if (rid) router.push(`/log-portion?recipeId=${encodeURIComponent(rid)}&slot=${type}&day=${key}`);
                          else logPlanned(type, selected);
                        }}
                      />
                      <View style={styles.actions}>
                        <ActionButton
                          label={rid ? t('mealPlan.viewRecipe') : t('mealPlan.addRecipe')}
                          variant="secondary"
                          style={{ flex: 1, backgroundColor: theme.card }}
                          onPress={() =>
                            router.push(rid ? `/recipe?id=${encodeURIComponent(rid)}&day=${key}&slot=${type}` : `/recipes?day=${key}&slot=${type}`)
                          }
                        />
                      </View>
                    </View>
                  )}
                </View>
              );
            }

            if (sectionMeals.length === 0) {
              return (
                <View key={type} style={[styles.rowCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
                  <IconTile icon="restaurant-outline" size={56} color={theme.textTertiary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[Type.eyebrow, { color: theme.textSecondary }]} numberOfLines={1}>
                      {slotLabel}
                    </Text>
                    <Text style={{ color: theme.textTertiary, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                      {t('food.nothingLogged')}
                    </Text>
                  </View>
                  {/* Log is the main thing to do with an empty meal; planning it is the quieter link. */}
                  <Pressable
                    onPress={() => openLog(type)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('food.logFood')} · ${slotLabel}`}
                    hitSlop={4}
                    style={({ pressed }) => [styles.logBtn, { backgroundColor: theme.surfaceTint }, pressed && { opacity: 0.7 }]}
                  >
                    <Icon name="add" size={16} color={theme.primary} />
                    <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }} numberOfLines={1}>
                      {t('food.logFood')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push(`/recipes?day=${key}&slot=${type}`)}
                    accessibilityRole="button"
                    accessibilityLabel={t('food.planSlot', { meal: slotLabel })}
                    hitSlop={6}
                    style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                      {t('food.plan')}
                    </Text>
                  </Pressable>
                </View>
              );
            }

            return (
              <View key={type} style={[styles.groupCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
                {sectionMeals.map((meal, mi) =>
                  meal.items.map((item, itemIndex) => {
                    const first = mi === 0 && itemIndex === 0;
                    const rec = recipeFor(item.recipeId);
                    // Same completeness rule as the portion editor: a known
                    // subtotal reads "≥", and nothing known reads "Unknown".
                    const unknown = itemUnknownNutrients(item);
                    const kcalUnknown = unknown.includes('calories');
                    const kcalLabel = kcalUnknown && item.calories === 0 ? t('nutrition.unknown') : `${knownLabel(num(item.calories), kcalUnknown)} ${t('common.kcal')}`;
                    return (
                      <Swipeable
                        key={`${meal.id}-${itemIndex}`}
                        overshootRight={false}
                        rightThreshold={40}
                        renderRightActions={() => (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${t('common.delete')} · ${item.name}`}
                            onPress={() => deleteRow(meal, itemIndex)}
                            style={[styles.swipeDelete, { backgroundColor: theme.danger }]}
                          >
                            <Icon name="trash" size={22} color="#fff" />
                            <Text style={styles.swipeDeleteText}>{t('common.delete')}</Text>
                          </Pressable>
                        )}
                      >
                      <Pressable
                        onPress={() =>
                          router.push(
                            item.recipeId
                              ? `/edit-portion?id=${encodeURIComponent(meal.id)}&index=${itemIndex}`
                              : `/meal-edit?id=${encodeURIComponent(meal.id)}`,
                          )
                        }
                        onLongPress={() => (meal.items.length > 1 ? confirmDeleteItem(meal, itemIndex) : confirmDelete(meal.id))}
                        accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
                        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && deleteRow(meal, itemIndex)}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name} · ${kcalLabel} · ${unknown.length > 0 ? t('mealPlan.incomplete') : t('mealPlan.logged')}`}
                        style={({ pressed }) => [
                          styles.mealRow,
                          !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                          added?.mealId === meal.id && { backgroundColor: theme.surfaceTint, borderRadius: 14, paddingHorizontal: 8 },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {/* The person's own photo first (a scan, or the recipe's), then the dish icon. */}
                        <PhotoFallback uri={meal.photoUri ?? rec?.photoUri} illustration={illustrationFor(item.name)} size={56} />
                        <View style={{ flex: 1 }}>
                          <Text style={[Type.eyebrow, { color: theme.textSecondary }]} numberOfLines={1}>
                            {first ? slotLabel : new Date(meal.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                            {first ? ` · ${new Date(meal.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}` : ''}
                            {first && sectionKcal > 0 && meal.items.length + sectionMeals.length > 2 ? ` · ${num(sectionKcal)} ${t('common.kcal')}` : ''}
                          </Text>
                          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }} numberOfLines={2}>
                            {item.name}
                          </Text>
                          {/* Two lines so the completeness marker is never the part that gets clipped. */}
                          <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={2}>
                            {portionText(item, t) ? `${portionText(item, t)} · ` : ''}
                            {kcalLabel}
                          </Text>
                          {/* Under the text rather than beside it, so the meal
                              and its time are never the part that gets cut off. */}
                          <View style={{ flexDirection: 'row', marginTop: 4 }}>
                            {unknown.length > 0 ? (
                              <StatusPill label={t('mealPlan.incomplete')} tone="review" icon="alert-circle-outline" />
                            ) : (
                              <StatusPill label={t('mealPlan.logged')} tone="logged" icon="checkmark" />
                            )}
                          </View>
                        </View>
                        <Icon name="chevron-forward" size={18} color={theme.textTertiary} />
                      </Pressable>
                      </Swipeable>
                    );
                  }),
                )}
                <Pressable
                  onPress={() => openLog(type)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.addMore, { borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="add" size={16} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('food.addToSlot', { meal: slotLabel })}</Text>
                </Pressable>
              </View>
            );
          })}

          {/* Cooking, shopping and the week's review: one compact row, each saying where it stands. */}
          <View style={[styles.links, { backgroundColor: theme.card }, cardShadow(theme.shadow)]} {...tilesTarget.bind}>
            {[
              { icon: 'restaurant-outline' as const, title: t('recipes.title'), sub: recipes.length > 0 ? t('food.recipesSaved', { n: recipes.length }) : t('food.recipesNone'), to: '/recipes' as const },
              { icon: 'cart-outline' as const, title: t('shopping.title'), sub: shopping ? t('food.shoppingOpen') : t('food.shoppingFromPlan'), to: '/shopping' as const },
              { icon: 'stats-chart-outline' as const, title: t('food.thisWeek'), sub: t('food.reviewNote'), to: '/review' as const },
            ].map((l, i) => (
              <Pressable
                key={l.to}
                onPress={() => router.push(l.to)}
                accessibilityRole="button"
                accessibilityLabel={`${l.title}. ${l.sub}`}
                style={({ pressed }) => [styles.link, i > 0 && { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: theme.border }, pressed && { opacity: 0.7 }]}
              >
                <Icon name={l.icon} size={19} color={theme.primary} />
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13, textAlign: 'center' }} numberOfLines={1}>
                  {l.title}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11, textAlign: 'center' }} numberOfLines={1}>
                  {l.sub}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Food utilities (S02): fasting stays here, labelled; sharing the day. */}
          <RowGroup title={t('food.utilities')} style={{ marginTop: Spacing.md }}>
            <SettingsRow icon="timer-outline" title={t('fasting.title')} subtitle={fastingCardLabel(activeFast, t)} onPress={() => router.push('/fasting')} />
            <SettingsRow
              icon="share-outline"
              title={t('food.shareDay')}
              subtitle={t('food.shareDayHint')}
              onPress={sharing ? undefined : shareDay}
              chevron={false}
              last
            />
          </RowGroup>
        </>
      )}
    </CollapsingScreen>
    {added && !deleted && (
      <View style={[styles.undoBar, { backgroundColor: theme.text }]} accessibilityLiveRegion="polite">
        <Icon name="checkmark-circle" size={18} color={theme.background} />
        <Text style={{ color: theme.background, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {t('food.addedTo', { meal: t(`home.mealTypes.${added.slot}`) })}
        </Text>
        <Pressable accessibilityRole="button" onPress={undoAdded} hitSlop={10}>
          <Text style={{ color: theme.background, fontWeight: '800' }}>{t('mealPlan.undo')}</Text>
        </Pressable>
      </View>
    )}
    {deleted && (
      <View style={[styles.undoBar, { backgroundColor: theme.text }]} accessibilityLiveRegion="polite">
        <Text style={{ color: theme.background, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {t('food.deletedRow', { name: deleted.name })}
        </Text>
        <Pressable accessibilityRole="button" onPress={undoDelete} hitSlop={10}>
          <Text style={{ color: theme.background, fontWeight: '800' }}>{t('mealPlan.undo')}</Text>
        </Pressable>
      </View>
    )}
    </View>
  );
}

/**
 * S11 — one planned day: planned vs eaten totals, one card per slot with
 * View recipe / Swap, the shopping coverage row. Planning writes nothing
 * here — every action leads to a preview, a picker or the recipe.
 */
function PlanDay({
  day,
  eaten,
  target,
  hasProgram,
  slotMeal,
  swapOptions,
  swappedFrom,
  onSwap,
  onLog,
  recipeFor,
  coverage,
  swapping,
  setSwapping,
  locale,
}: {
  day: Date;
  eaten: number;
  target?: number;
  hasProgram: boolean;
  slotMeal: (slot: MealType) => ReturnType<typeof plannedMealFor>;
  swapOptions: (slot: MealType) => ReturnType<typeof plannedMealOptions>;
  swappedFrom: (slot: MealType) => number | undefined;
  onSwap: (slot: MealType, weekday: number) => void;
  onLog: (slot: MealType) => void;
  recipeFor: (id?: string) => ReturnType<typeof useAppStore.getState>['recipes'][number] | undefined;
  coverage: { meals: unknown[]; plannedTotal: number };
  swapping: MealType | null;
  setSwapping: (s: MealType | null) => void;
  locale: string;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const key = dateKey(day);
  const num = (n: number) => Math.round(n).toLocaleString(i18n.language === 'ar' ? 'ar' : 'en');
  const rows = MEAL_TYPES.map((slot) => ({ slot, meal: slotMeal(slot) }));
  const planned = rows.reduce((sum, r) => sum + (r.meal ? plannedMealCalories(r.meal) : 0), 0);
  const anyPlanned = rows.some((r) => r.meal);
  const isToday = isSameDay(new Date().toISOString(), day);
  return (
    <>
      <View style={[styles.card, { backgroundColor: theme.card, marginTop: Spacing.md }, cardShadow(theme.shadow)]}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('mealPlan.planned')}</Text>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 22 }}>
              {num(planned)} <Text style={{ fontSize: 14, fontWeight: '600' }}>{t('common.kcal')}</Text>
            </Text>
          </View>
          <View style={[{ flex: 1, paddingStart: Spacing.md, borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: theme.border }]}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('home.consumed')}</Text>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 22 }}>
              {num(eaten)} <Text style={{ fontSize: 14, fontWeight: '600' }}>{t('common.kcal')}</Text>
            </Text>
          </View>
        </View>
        {target != null && (
          <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: Spacing.sm }}>{t('food.dailyTarget', { kcal: num(target) })}</Text>
        )}
      </View>

      {!hasProgram && !anyPlanned && (
        <EmptyState
          icon="calendar-outline"
          title={t('food.noPlanTitle')}
          body={t('food.noPlanBody')}
          action={{ label: t('food.planFromRecipes'), icon: 'restaurant', onPress: () => router.push(`/recipes?day=${key}&slot=lunch`) }}
          secondary={{ label: t('food.buildWithAi'), icon: 'sparkles', onPress: () => router.push('/program') }}
        />
      )}

      <SectionTitle style={{ marginTop: Spacing.xs }}>
        {t('food.mealsFor', { day: day.toLocaleDateString(locale, { day: 'numeric', month: 'long' }) })}
      </SectionTitle>

      {rows.map(({ slot, meal }) => {
        const recipeId = meal?.items[0]?.recipeId;
        const rec = recipeFor(recipeId);
        const options = swapping === slot ? swapOptions(slot) : [];
        const from = swappedFrom(slot);
        const slotLabel = t(`home.mealTypes.${slot}`);
        return (
          <View key={slot} style={[styles.groupCard, { backgroundColor: theme.card, paddingVertical: Spacing.ms }, cardShadow(theme.shadow)]}>
            <View style={styles.rowTop}>
              {meal ? (
                <PhotoFallback uri={rec?.photoUri} illustration={illustrationFor(meal.name)} size={64} />
              ) : (
                <IconTile icon="restaurant-outline" size={64} color={theme.textTertiary} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>
                  {slotLabel}
                  {from != null ? ` · ${weekdayLabel(from, locale)}` : ''}
                </Text>
                {meal ? (
                  <>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }} numberOfLines={2}>
                      {meal.name}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                      {meal.items.length === 1 && portionText(meal.items[0], t) ? `${portionText(meal.items[0], t)} · ` : ''}
                      {knownLabel(num(plannedMealCalories(meal)), plannedKcalUnknown(meal))} {t('common.kcal')}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: theme.textTertiary, fontSize: 13, marginTop: 2 }}>{t('food.nothingPlanned')}</Text>
                )}
              </View>
            </View>
            <View style={[styles.actionStack, { marginTop: Spacing.sm }]}>
              {/* Primary action on its own row; View recipe and Swap share the row beneath. */}
              {meal && isToday && (
                <ActionButton
                  label={t('mealPlan.logEaten')}
                  onPress={() =>
                    recipeId ? router.push(`/log-portion?recipeId=${encodeURIComponent(recipeId)}&slot=${slot}&day=${key}`) : onLog(slot)
                  }
                />
              )}
              <View style={styles.actions}>
                <ActionButton
                  label={recipeId ? t('mealPlan.viewRecipe') : meal ? t('mealPlan.addRecipe') : t('food.planSlot', { meal: slotLabel })}
                  variant="secondary"
                  icon={recipeId ? undefined : 'add'}
                  style={{ flex: 1 }}
                  onPress={() =>
                    router.push(recipeId ? `/recipe?id=${encodeURIComponent(recipeId)}&day=${key}&slot=${slot}` : `/recipes?day=${key}&slot=${slot}`)
                  }
                />
                {meal && (
                  <ActionButton
                    label={t('mealPlan.swap')}
                    variant="secondary"
                    icon="swap-horizontal"
                    style={{ flex: 1 }}
                    onPress={() => {
                      // A programme slot swaps with another weekday's meal; a
                      // date-planned recipe swaps by choosing another recipe.
                      if (swapOptions(slot).length > 1) setSwapping(swapping === slot ? null : slot);
                      else router.push(`/recipes?day=${key}&slot=${slot}`);
                    }}
                  />
                )}
              </View>
            </View>
            {swapping === slot && options.length > 0 && (
              <View style={styles.swapList}>
                {options.map(({ weekday, meal: option }) => {
                  const active = meal?.name === option.name;
                  return (
                    <Pressable
                      key={weekday}
                      onPress={() => {
                        onSwap(slot, weekday);
                        setSwapping(null);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.swapRow,
                        { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.card },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                          {option.name}
                        </Text>
                        <Text style={{ color: theme.textTertiary, fontSize: 11 }}>
                          {weekdayLabel(weekday, locale)} · {num(plannedMealCalories(option))} {t('common.kcal')}
                        </Text>
                      </View>
                      {active && <Icon name="checkmark-circle" size={16} color={theme.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      <View style={[styles.groupCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <SettingsRow
          icon="cart-outline"
          title={t('shopping.title')}
          subtitle={
            coverage.plannedTotal === 0
              ? t('food.shoppingFromPlan')
              : t('shopping.coverage', { withRecipe: coverage.meals.length, planned: coverage.plannedTotal })
          }
          onPress={() => router.push('/shopping')}
          last
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  swipeDelete: { justifyContent: 'center', alignItems: 'center', width: 88, gap: 2 },
  swipeDeleteText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  undoBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  segmentWrap: { borderRadius: Radius.control + 6, padding: 4 },
  planHead: { marginBottom: Spacing.ms, gap: 2 },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
  groupCard: { borderRadius: Radius.module, paddingHorizontal: Spacing.md, marginBottom: Spacing.ms },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.ms, marginBottom: Spacing.ms },
  plannedCard: { borderRadius: Radius.module, padding: Spacing.ms, marginBottom: Spacing.ms, gap: Spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  kcalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  actionStack: { gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  loggedNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, paddingVertical: Spacing.ms },
  addMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  logBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 12, minHeight: 36, flexShrink: 0 },
  links: { flexDirection: 'row', borderRadius: Radius.module, paddingVertical: Spacing.ms, marginTop: Spacing.xs, marginBottom: Spacing.ms },
  link: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 6, minHeight: 44 },
  swapList: { gap: 6, marginTop: Spacing.sm },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.control, paddingVertical: 8, paddingHorizontal: 10 },
});
