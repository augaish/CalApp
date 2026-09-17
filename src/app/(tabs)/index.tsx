import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { CollapsingScreen } from '@/components/collapsing-screen';
import { WeekBars } from '@/components/charts';
import { SponsorCard } from '@/components/sponsor-card';
import { ActionButton, DayStrip, IconTile, IllustrationTile, MacroRow, ProgressTrack, SectionTitle, SettingsRow, StatusPill } from '@/components/system';
import { TargetUpdateModal } from '@/components/target-update-modal';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resolvePlan } from '@/lib/occurrences';
import { formatWeight } from '@/lib/units';
import { fetchWhoopDayBurn } from '@/lib/api';
import { useViewDay } from '@/lib/day';
import { exerciseName, findExercise } from '@/lib/exercises';
import { usePending } from '@/lib/pending';
import {
  actualBurnedForDay,
  applyOrder,
  dateKey,
  isSameDay,
  mealTypeForNow,
  mealTypesLogged,
  plannedMealFor,
  programProgress,
  streakDays,
  totalsForDay,
  useAppStore,
  waterForDay,
  waterTargetMl,
} from '@/lib/store';
import { targetsNeedUpdate } from '@/lib/tdee';
import { useTour, useTourTarget } from '@/lib/tour';
import { useAllRecipes } from '@/lib/use-recipes';
import type { MealType } from '@/lib/types';

const MAIN_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];

/**
 * The meal slot the next-step card should point at: the first main meal not
 * yet logged, counting from the slot the clock says it is. Skipping earlier
 * unlogged slots is deliberate — at 8pm, nudging someone to log breakfast
 * reads as nagging about the past rather than helping with dinner. Once the
 * clock is past dinner (or every main meal is in) there's nothing to chase,
 * and the card offers a snack instead.
 */
function nextMealSlot(logged: Set<MealType>): MealType | null {
  const now = mealTypeForNow();
  if (now === 'snack') return null;
  const from = MAIN_MEALS.indexOf(now);
  return MAIN_MEALS.slice(from).find((m) => !logged.has(m)) ?? null;
}

/** Seven days ending on (and including) the given day. */
function sevenDaysEnding(end: Date): Date[] {
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

/**
 * S01 Overview — the selected day's actual progress and the next useful
 * actions. Reads diary totals, completed workouts, the active plan and the
 * most recent reading with its real date; writes nothing itself. Every
 * action here opens the screen that owns the write.
 */
export default function Overview() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const units = useAppStore((s) => s.units);
  const profile = useAppStore((s) => s.profile);
  const targets = useAppStore((s) => s.targets);
  const meals = useAppStore((s) => s.meals);
  const water = useAppStore((s) => s.water);
  const workouts = useAppStore((s) => s.workouts);
  const whoopBurnByDay = useAppStore((s) => s.whoopBurnByDay);
  const whoopWorkoutsByDay = useAppStore((s) => s.whoopWorkoutsByDay);
  const weights = useAppStore((s) => s.weights);
  const activeProgram = useAppStore((s) => s.activeProgram);
  const schedule = useAppStore((s) => s.schedule);
  const occurrences = useAppStore((s) => s.occurrences);
  const savedSchedules = useAppStore((s) => s.savedSchedules);
  const activeScheduleId = useAppStore((s) => s.activeScheduleId);
  const skips = useAppStore((s) => s.skips);
  const dayOrder = useAppStore((s) => s.dayOrder);
  const exercises = useAppStore((s) => s.exercises);
  const activeSession = useAppStore((s) => s.activeSession);
  const startSession = useAppStore((s) => s.startSession);
  const mealPlanSwaps = useAppStore((s) => s.mealPlanSwaps);
  const mealPlanRecipes = useAppStore((s) => s.mealPlanRecipes);
  const recipes = useAllRecipes();
  const checklistDismissed = useAppStore((s) => s.checklistDismissed);
  const dismissChecklist = useAppStore((s) => s.dismissChecklist);
  const tourSeen = useAppStore((s) => s.tourSeen);
  const tourActive = useTour((s) => s.active);
  const setTourSeen = useAppStore((s) => s.setTourSeen);
  const setWhoopDayBurn = useAppStore((s) => s.setWhoopDayBurn);
  const setWhoopDayWorkouts = useAppStore((s) => s.setWhoopDayWorkouts);
  // Starts already-flagged when there's a mismatch coming INTO this mount —
  // not only one created by logging a weight during this visit — so
  // profile.weightKg drifting stale from an earlier session still gets caught
  // once you're back, instead of silently staying wrong until the next log.
  const [pendingWeightKg, setPendingWeightKg] = useState<number | null>(() => {
    if (!profile || weights.length === 0) return null;
    const latest = weights[0];
    return targetsNeedUpdate(profile, latest.kg) ? latest.kg : null;
  });

  const selected = useViewDay((s) => s.day);
  const setDay = useViewDay((s) => s.setDay);
  const shift = useViewDay((s) => s.shift);

  // Tour targets (hooks, so they run before the early return below).
  const stepsTarget = useTourTarget('overview.steps');
  const nutritionTarget = useTourTarget('overview.nutrition');

  // Same WHOOP refresh as the Training tab: Overview is often the first
  // screen opened, so it shouldn't need a Training visit to pick up today's
  // real burn. Stores both the total and the per-workout split from the one
  // call so this screen and the exercise rows never disagree.
  useEffect(() => {
    if (!isSameDay(new Date().toISOString(), selected)) return;
    const start = new Date(selected);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selected);
    end.setHours(23, 59, 59, 999);
    let alive = true;
    fetchWhoopDayBurn(start.toISOString(), end.toISOString()).then(({ totalKcal, workouts: w }) => {
      if (!alive) return;
      setWhoopDayBurn(selected, totalKcal);
      setWhoopDayWorkouts(selected, w);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (!targets || !profile) return null;

  const totals = totalsForDay(meals, selected);
  const incomplete = totals.incomplete ?? [];
  const kcalIncomplete = incomplete.includes('calories');
  const remaining = targets.calories - totals.calories;
  const over = remaining < 0;
  const waterMl = waterForDay(water, selected);
  const waterTarget = waterTargetMl(profile.weightKg);
  const burned = actualBurnedForDay(workouts, whoopBurnByDay, whoopWorkoutsByDay, selected);
  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const streak = streakDays(meals);
  const programGlance = activeProgram ? programProgress(activeProgram) : null;
  const num = (n: number) => Math.round(n).toLocaleString(locale);

  // Today block — the same "what's on today" list the Training tab shows
  // (weekly plan minus skips, in the user's order), so starting a session
  // from here and from there walk through identical exercises.
  const todayPlan = resolvePlan(schedule, occurrences, selected)?.day;
  const todaySkips = skips[dateKey(selected)] ?? [];
  const todayDoneIds = new Set(
    workouts.filter((w) => isSameDay(w.at, selected) && w.sets.some((s) => s.done)).map((w) => w.exerciseId),
  );
  // Scheduled exercises PLUS anything actually trained today that the
  // schedule does not know about. What was done takes precedence over what a
  // plan happens to say (S01: completed workout over a newly selected rest
  // day) — two roots must never disagree about whether you trained.
  const scheduledIds = todayPlan ? todayPlan.exerciseIds.filter((id) => !todaySkips.includes(id)) : [];
  const unplannedDoneIds = [...todayDoneIds].filter((id) => !scheduledIds.includes(id));
  const todayIds = applyOrder([...scheduledIds, ...unplannedDoneIds], dayOrder[dateKey(selected)]);
  const todayDoneCount = todayIds.filter((id) => todayDoneIds.has(id)).length;
  const todayOnlyUnplanned = scheduledIds.length === 0 && unplannedDoneIds.length > 0;
  const todayNames = todayIds.map((id) => {
    const ex = findExercise(id, exercises);
    return ex ? exerciseName(ex, locale) : id;
  });
  const activeScheduleName = savedSchedules.find((s) => s.id === activeScheduleId)?.name || t('today.myPlan');
  const sessionIsToday = activeSession?.dayKey === dateKey(new Date());
  const mealsLogged = mealTypesLogged(meals, selected);
  const nextMeal = nextMealSlot(mealsLogged);
  const nextPlanned = nextMeal
    ? plannedMealFor(activeProgram?.mealPlan, selected, nextMeal, mealPlanSwaps, mealPlanRecipes, recipes, activeProgram?.id)
    : undefined;
  const nextPlannedKcal = nextPlanned ? nextPlanned.items.reduce((sum, i) => sum + i.calories, 0) : 0;
  const nextPlannedPortion = nextPlanned?.items.length === 1 ? nextPlanned.items[0].portion : undefined;
  const openMealEntry = (slot: MealType, via: 'scan' | 'menu') => {
    usePending.getState().setMealTypeHint(slot);
    router.push(via === 'scan' ? '/scan?mode=meal' : '/add-menu?scope=food');
  };

  // The strip shows the current week (ending today) whenever the selected day
  // is still inside it, so tapping a day in view never reshuffles the row.
  // Only once you arrow back past that window does it start following you.
  const thisWeek = sevenDaysEnding(new Date());
  const days = thisWeek.some((d) => isSameDay(d.toISOString(), selected)) ? thisWeek : sevenDaysEnding(selected);
  const chartLabels = days.map((d) => d.toLocaleDateString(locale, { weekday: 'narrow' }));
  const calValues = days.map((d) => Math.round(totalsForDay(meals, d).calories));
  // "As of" the day currently being viewed — the most recent reading on or
  // before it, not always the single latest one, so scrubbing days with the
  // strip actually changes what this card shows.
  const selectedEnd = new Date(selected);
  selectedEnd.setHours(23, 59, 59, 999);
  const latestWeight = weights.find((w) => new Date(w.at).getTime() <= selectedEnd.getTime());

  // First-run activation checklist — derived from real data, auto-hides once complete.
  const checklist = [
    { key: 'scanMeal', icon: 'camera' as const, done: meals.length > 0, onPress: () => router.push('/scan?mode=meal') },
    { key: 'logWorkout', icon: 'barbell' as const, done: workouts.length > 0, onPress: () => router.push('/exercise-library') },
    { key: 'buildSchedule', icon: 'calendar' as const, done: Object.values(schedule).some((d) => d.exerciseIds.length > 0), onPress: () => router.push('/schedule') },
    { key: 'logWater', icon: 'water' as const, done: water.length > 0, onPress: () => router.push('/water') },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;
  const showChecklist = !checklistDismissed && checklistDone < checklist.length;

  const dateLine = selected.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const trainingTitle = activeSession
    ? sessionIsToday
      ? todayPlan?.title || t('today.inProgress')
      : t('session.finishUnfinished', {
          date: (() => {
            const [y, m, d] = activeSession.dayKey.split('-').map(Number);
            return new Date(y, m, d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
          })(),
        })
    : todayIds.length > 0
      ? todayPlan?.title || t('training.todaysWorkout')
      : t('today.restDay');
  const trainingSub = activeSession
    ? t('session.progress', {
        current: Math.min(activeSession.index + 1, activeSession.exerciseIds.length),
        total: activeSession.exerciseIds.length,
      })
    : todayIds.length > 0
      ? todayDoneCount > 0
        ? `${t('today.doneOf', { done: todayDoneCount, total: todayIds.length })}${burned > 0 ? ` · ${t('today.burnedLine', { kcal: burned })}` : ''}`
        : `${activeScheduleName} · ${t('today.exercises', { count: todayIds.length })}`
      : t('today.restDayHint');

  // The band (brand row, date, day strip) scrolls with the content; the
  // compact bar keeps the brand, AI Support and Profile reachable.
  const header = (
    <>
      {/* Day context: chevrons are locked LTR because the glyphs don't mirror. */}
      <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Pressable onPress={() => router.push('/calendar')} hitSlop={8} accessibilityRole="button" accessibilityLabel={dateLine} style={styles.dateTap}>
              <Text style={[Type.title, { color: theme.onGradient }]}>
                {selectedIsToday ? t('home.today') : selected.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
              </Text>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.9)" />
            </Pressable>
            <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '500' }}>{dateLine}</Text>
          </View>
          <Pressable
            onPress={() => Alert.alert(t('home.streakTitle', { count: streak }), t('home.streakBody'))}
            accessibilityRole="button"
            accessibilityLabel={t('home.streakTitle', { count: streak })}
            style={[styles.streak, { backgroundColor: 'rgba(33,27,46,0.22)' }]}
          >
            <Ionicons name="flame" size={15} color="#FFD166" />
            <Text style={{ color: theme.onGradient, fontWeight: '800', fontSize: 13 }}>{streak}</Text>
          </Pressable>
          <View style={[styles.arrows, { direction: 'ltr' }]}>
            <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.arrow}>
              <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.95)" />
            </Pressable>
            <Pressable onPress={() => shift(1)} hitSlop={10} disabled={selectedIsToday} accessibilityRole="button" accessibilityLabel={t('common.next')} style={styles.arrow}>
              <Ionicons name="chevron-forward" size={20} color={selectedIsToday ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.95)'} />
            </Pressable>
          </View>
        </View>
      <DayStrip days={days} selected={selected} onSelect={setDay} locale={locale} onGradient disabledAfter={new Date()} />
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <CollapsingScreen title={t('common.appName')} header={header}>
        {!tourSeen && !tourActive && (
          <Pressable
            onPress={() => useTour.getState().start()}
            style={({ pressed }) => [styles.tourBanner, { backgroundColor: theme.surfaceTint, borderColor: theme.primary }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="sparkles" size={18} color={theme.primary} />
            <Text style={{ color: theme.primary, fontWeight: '700', flex: 1 }}>{t('tour.banner')}</Text>
            <Pressable onPress={setTourSeen} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={18} color={theme.textTertiary} />
            </Pressable>
          </Pressable>
        )}

        {/* Your next steps — train and eat, as equal cards with one action
            each. Only for today: a past day is for reading, not acting. */}
        {selectedIsToday && (
          <>
            <SectionTitle style={{ marginTop: Spacing.sm }}>{t('today.nextSteps')}</SectionTitle>

            {/* Each Overview card is a door to its own screen; the button inside stays the shortcut. */}
            <Pressable
              {...stepsTarget.bind}
              onPress={() => router.push('/training')}
              accessibilityRole="button"
              accessibilityLabel={`${t('today.trainingLabel')} · ${t('tabs.training')}`}
              style={({ pressed }) => [styles.stepCard, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.eyebrowRow}>
                  <Ionicons name="barbell" size={15} color={theme.primary} />
                  <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{t('today.trainingLabel')}</Text>
                  <Ionicons name="chevron-forward" size={13} color={theme.textTertiary} />
                </View>
                <Text style={[styles.stepTitle, { color: theme.text }]} numberOfLines={2}>
                  {trainingTitle}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                  {trainingSub}
                </Text>
                {todayIds.length > 0 && todayDoneCount === 0 && !activeSession && (
                  <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {todayNames.join(' · ')}
                  </Text>
                )}
                <View style={styles.stepAction}>
                  {activeSession ? (
                    <ActionButton label={t('session.resume')} icon="play" onPress={() => router.push('/session')} />
                  ) : todayIds.length > 0 ? (
                    todayDoneCount >= todayIds.length ? (
                      <View style={[styles.doneRow, { backgroundColor: theme.surfaceTint }]}>
                        <Ionicons name="checkmark-circle" size={16} color={theme.successText} />
                        <Text style={{ color: theme.successText, fontWeight: '700', fontSize: 13 }}>{t('today.workoutDone')}</Text>
                      </View>
                    ) : (
                      <ActionButton
                        label={t('today.startWorkout')}
                        icon="play"
                        onPress={() => {
                          startSession(selected, todayIds);
                          router.push('/session');
                        }}
                      />
                    )
                  ) : (
                    <ActionButton label={t('today.addExercise')} icon="add" variant="secondary" onPress={() => router.push('/exercise-library')} />
                  )}
                </View>
                {todayOnlyUnplanned && todayDoneCount >= todayIds.length && (
                  <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: 6 }}>{t('today.noFurtherPlanned')}</Text>
                )}
              </View>
              <IllustrationTile icon="barbell" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/food')}
              accessibilityRole="button"
              accessibilityLabel={`${t('today.nextMealLabel')} · ${t('tabs.food')}`}
              style={({ pressed }) => [styles.stepCard, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.eyebrowRow}>
                  <Ionicons name="restaurant" size={15} color={theme.carbs} />
                  <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>
                    {nextMeal
                      ? nextPlanned
                        ? t('today.plannedMeal', { meal: t(`home.mealTypes.${nextMeal}`) })
                        : t('today.nextMealLabel')
                      : t('today.nextMealLabel')}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={theme.textTertiary} />
                </View>
                <Text style={[styles.stepTitle, { color: theme.text }]} numberOfLines={2}>
                  {nextMeal ? (nextPlanned ? nextPlanned.name : t(`home.mealTypes.${nextMeal}`)) : t('today.allLogged')}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                  {nextPlanned
                    ? `${nextPlannedPortion ? `${nextPlannedPortion} · ` : ''}${num(nextPlannedKcal)} ${t('common.kcal')}`
                    : nextMeal
                      ? t('today.doneOf', { done: MAIN_MEALS.filter((m) => mealsLogged.has(m)).length, total: MAIN_MEALS.length })
                      : t('today.allLoggedHint')}
                </Text>
                <View style={styles.stepAction}>
                  {nextMeal && nextPlanned?.items[0]?.recipeId ? (
                    <ActionButton
                      label={t('mealPlan.viewRecipe')}
                      variant="secondary"
                      onPress={() =>
                        router.push(
                          `/recipe?id=${encodeURIComponent(nextPlanned.items[0].recipeId as string)}&day=${dateKey(selected)}&slot=${nextMeal}`,
                        )
                      }
                    />
                  ) : nextMeal ? (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <ActionButton label={t('today.scan')} icon="camera" onPress={() => openMealEntry(nextMeal, 'scan')} style={{ flex: 1 }} />
                      <ActionButton label={t('today.log')} icon="add" variant="secondary" onPress={() => openMealEntry(nextMeal, 'menu')} style={{ flex: 1 }} />
                    </View>
                  ) : (
                    <ActionButton label={t('today.addSnack')} icon="add" variant="secondary" onPress={() => openMealEntry('snack', 'menu')} />
                  )}
                </View>
              </View>
              <IllustrationTile icon="restaurant" />
            </Pressable>
          </>
        )}

        {showChecklist && (
          <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            <View style={styles.checklistHead}>
              <Ionicons name="rocket" size={18} color={theme.primary} />
              <Text style={[styles.cardTitle, { color: theme.text, flex: 1, marginBottom: 0 }]}>{t('checklist.title')}</Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '700' }}>
                {t('checklist.progress', { done: checklistDone, total: checklist.length })}
              </Text>
              <Pressable onPress={dismissChecklist} hitSlop={8} style={{ padding: 2 }} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={18} color={theme.textTertiary} />
              </Pressable>
            </View>
            <View style={{ marginTop: Spacing.sm }}>
              {checklist.map((item) => (
                <Pressable key={item.key} onPress={item.onPress} accessibilityRole="button" style={({ pressed }) => [styles.checklistRow, pressed && { opacity: 0.6 }]}>
                  <View style={[styles.checkCircle, item.done ? { backgroundColor: theme.primary, borderColor: theme.primary } : { borderColor: theme.border }]}>
                    {item.done && <Ionicons name="checkmark" size={14} color={theme.onPrimary} />}
                  </View>
                  <Text style={{ flex: 1, color: item.done ? theme.textTertiary : theme.text, fontWeight: '600', textDecorationLine: item.done ? 'line-through' : 'none' }}>
                    {t(`checklist.${item.key}`)}
                  </Text>
                  {!item.done && <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Nutrition today — actual diary entries only; planned food is not here. */}
        <Pressable
          {...nutritionTarget.bind}
          onPress={() => router.push('/food')}
          accessibilityRole="button"
          accessibilityLabel={`${t('today.nutritionToday')} · ${t('tabs.food')}`}
          style={({ pressed }) => [styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.85 }]}
        >
          <View style={styles.linkTitle}>
            <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0, flex: 1 }]}>{t('today.nutritionToday')}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </View>
          <View style={styles.kcalRow}>
            <Text style={{ color: theme.text }}>
              <Text style={{ fontSize: 26, fontWeight: '800' }}>{kcalIncomplete ? '≥' : ''}{num(totals.calories)}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}> {t('today.kcalEatenOf', { target: num(targets.calories) })}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
              {over ? t('today.overBy', { n: num(-remaining) }) : kcalIncomplete ? t('today.leftAtMost', { n: num(remaining) }) : t('today.left', { n: num(remaining) })}
            </Text>
          </View>
          <ProgressTrack value={totals.calories} max={targets.calories} approx={kcalIncomplete} />
          <MacroRow
            values={totals}
            targets={targets}
            labels={{ protein: t('home.protein'), carbs: t('home.carbs'), fat: t('home.fat') }}
            unit={t('common.grams')}
            unknown={incomplete}
          />
          {incomplete.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.sm }}>
              <StatusPill label={t('mealPlan.incomplete')} tone="review" icon="alert-circle-outline" />
              <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>{t('food.incompleteNote')}</Text>
            </View>
          )}
        </Pressable>

        {/* Latest weight — read-only. A reading shown today is not a reading
            taken today, so it carries its own date and source (S01). */}
        <Pressable
          onPress={() => router.push('/health')}
          accessibilityRole="button"
          accessibilityLabel={`${t('today.latestWeight')} · ${t('tabs.health')}`}
          style={({ pressed }) => [styles.rowCard, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.85 }]}
        >
          <IconTile icon="scale-outline" size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('today.latestWeight')}</Text>
            {latestWeight ? (
              <>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
                  {formatWeight(latestWeight.kg, units, t)}
                </Text>
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {new Date(latestWeight.at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  {' · '}
                  {latestWeight.source === 'scan' ? t('health.sourceScan') : t('health.sourceManual')}
                </Text>
              </>
            ) : (
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{t('today.noReadingYet')}</Text>
            )}
          </View>
          {latestWeight ? (
            <ActionButton label={t('progress.viewHealth')} icon="chevron-forward" variant="secondary" onPress={() => router.push('/health')} />
          ) : (
            <ActionButton label={t('health.addReading')} icon="add" variant="secondary" onPress={() => router.push('/body-reading')} />
          )}
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </Pressable>

        {/* Water — the row reads; the sheet (S24) writes. */}
        <Pressable
          onPress={() => router.push('/water')}
          accessibilityRole="button"
          accessibilityLabel={t('home.water')}
          style={({ pressed }) => [styles.rowCard, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.85 }]}
        >
          <IconTile icon="water" size={40} color={theme.water} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('home.water')}</Text>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
              {(waterMl / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
                {' '}/ {(waterTarget / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} {t('today.litre')}
              </Text>
            </Text>
          </View>
          {selectedIsToday && <ActionButton label={t('today.addWater')} icon="add" variant="secondary" onPress={() => router.push('/water')} />}
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </Pressable>

        {/* AI program — a row, not a hero: drafts are reviewed in their own screen. */}
        <View style={[styles.groupCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <SettingsRow
            icon="sparkles-outline"
            title={activeProgram ? t('program.title') : t('program.introTitle')}
            subtitle={
              activeProgram && programGlance
                ? `${t('program.weekProgress', { current: programGlance.weekNumber, total: activeProgram.durationWeeks })} · ${t('program.daysLeft', { count: programGlance.daysLeft })}`
                : undefined
            }
            onPress={() => router.push('/program')}
            last
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          {/* The bars keep their tap-to-filter; the title is the door to the weekly review. */}
          <Pressable
            onPress={() => router.push('/review')}
            accessibilityRole="button"
            accessibilityLabel={`${t('progress.calories7d')} · ${t('review.title')}`}
            hitSlop={6}
            style={({ pressed }) => [styles.linkTitle, { marginBottom: Spacing.md }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0, flex: 1 }]}>{t('progress.calories7d')}</Text>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('review.title')}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.primary} />
          </Pressable>
          <WeekBars
            values={calValues}
            target={targets.calories}
            labels={chartLabels}
            color={theme.primary}
            onSelect={(i) => setDay(days[i])}
            selectedIndex={days.findIndex((d) => isSameDay(d.toISOString(), selected))}
          />
        </View>

        <SponsorCard />
      </CollapsingScreen>

      <TargetUpdateModal
        visible={pendingWeightKg != null}
        profile={profile}
        newWeightKg={pendingWeightKg ?? profile.weightKg}
        onUpdate={() => {
          const w = pendingWeightKg;
          setPendingWeightKg(null);
          router.push(`/edit-profile?weightKg=${w}`);
        }}
        onDismiss={() => setPendingWeightKg(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.ms },
  dateTap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, borderRadius: Radius.pill, paddingHorizontal: 10 },
  arrows: { flexDirection: 'row', gap: 2 },
  arrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  groupCard: { borderRadius: Radius.module, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: Spacing.md },
  linkTitle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  stepCard: { flexDirection: 'row', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  stepTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  stepAction: { marginTop: Spacing.ms, alignSelf: 'stretch' },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.control, minHeight: 44 },
  kcalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  tourBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.sm,
  },
  checklistHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 9 },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
