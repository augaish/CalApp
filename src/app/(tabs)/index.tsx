import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrendLine, WeekBars } from '@/components/charts';
import { CoachTour, type TourRect, type TourStep } from '@/components/coach-tour';
import { Ring } from '@/components/ring';
import { SponsorCard } from '@/components/sponsor-card';
import { Button, Field } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timestampFor, useViewDay } from '@/lib/day';
import { normalizeDigits } from '@/lib/numbers';
import {
  burnedForDay,
  isSameDay,
  streakDays,
  totalsForDay,
  useAppStore,
  waterForDay,
  waterTargetMl,
} from '@/lib/store';

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

export default function Overview() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const profile = useAppStore((s) => s.profile);
  const targets = useAppStore((s) => s.targets);
  const meals = useAppStore((s) => s.meals);
  const water = useAppStore((s) => s.water);
  const workouts = useAppStore((s) => s.workouts);
  const weights = useAppStore((s) => s.weights);
  const schedule = useAppStore((s) => s.schedule);
  const checklistDismissed = useAppStore((s) => s.checklistDismissed);
  const dismissChecklist = useAppStore((s) => s.dismissChecklist);
  const tourSeen = useAppStore((s) => s.tourSeen);
  const setTourSeen = useAppStore((s) => s.setTourSeen);
  const logWeight = useAppStore((s) => s.logWeight);

  const selected = useViewDay((s) => s.day);
  const setDay = useViewDay((s) => s.setDay);
  const shift = useViewDay((s) => s.shift);
  const [kg, setKg] = useState('');

  // Coach-tour hooks must run before the early return below (rules of hooks).
  const ringRef = useRef<View>(null);
  const weekRef = useRef<View>(null);
  const [tourSteps, setTourSteps] = useState<TourStep[] | null>(null);
  const [tourIndex, setTourIndex] = useState(0);

  if (!targets || !profile) return null;

  const totals = totalsForDay(meals, selected);
  const remaining = targets.calories - totals.calories;
  const over = remaining < 0;
  const waterMl = waterForDay(water, selected);
  const waterTarget = waterTargetMl(profile.weightKg);
  const burned = burnedForDay(workouts, selected);
  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const streak = streakDays(meals);

  const days = sevenDaysEnding(selected);
  const chartLabels = days.map((d) => d.toLocaleDateString(locale, { weekday: 'narrow' }));
  const calValues = days.map((d) => Math.round(totalsForDay(meals, d).calories));
  // Last 8 weight entries oldest→newest, with short date labels for the x-axis.
  const recentWeights = [...weights].slice(0, 8).reverse();
  const weightSeries = recentWeights.map((w) => w.kg);
  const weightLabels = recentWeights.map((w) =>
    new Date(w.at).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }),
  );

  // First-run activation checklist — derived from real data, auto-hides once complete.
  const checklist = [
    { key: 'scanMeal', icon: 'camera' as const, done: meals.length > 0, onPress: () => router.push('/scan?mode=meal') },
    { key: 'logWorkout', icon: 'barbell' as const, done: workouts.length > 0, onPress: () => router.push('/exercise-library') },
    { key: 'buildSchedule', icon: 'calendar' as const, done: Object.values(schedule).some((d) => d.exerciseIds.length > 0), onPress: () => router.push('/schedule') },
    { key: 'logWater', icon: 'water' as const, done: water.length > 0, onPress: () => router.push('/water') },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;
  const showChecklist = !checklistDismissed && checklistDone < checklist.length;

  // Spotlight coach-tour: measure the elements we own, then walk through them.
  const measureRect = (ref: React.RefObject<View | null>) =>
    new Promise<TourRect | null>((resolve) => {
      const node = ref.current;
      if (!node) return resolve(null);
      node.measureInWindow((x, y, w, h) =>
        resolve(w ? { x, y, width: w, height: h } : null),
      );
    });

  const startTour = async () => {
    const ring = await measureRect(ringRef);
    const week = await measureRect(weekRef);
    // The center + FAB sits bottom-centre, straddling the tab bar's top edge.
    const fab: TourRect = { x: width / 2 - 34, y: height - insets.bottom - 82, width: 68, height: 68 };
    setTourSteps([
      { rect: ring, title: t('tour.ring.title'), body: t('tour.ring.body') },
      { rect: week, title: t('tour.week.title'), body: t('tour.week.body') },
      { rect: fab, title: t('tour.add.title'), body: t('tour.add.body') },
    ]);
    setTourIndex(0);
  };

  const endTour = () => {
    setTourSteps(null);
    setTourIndex(0);
    setTourSeen();
  };

  const advanceTour = () => {
    if (tourSteps && tourIndex < tourSteps.length - 1) setTourIndex((i) => i + 1);
    else endTour();
  };

  const submitWeight = () => {
    const value = parseFloat(kg);
    if (!value || value < 30 || value > 300) {
      Alert.alert(t('onboarding.invalidInput'));
      return;
    }
    logWeight(value, timestampFor(selected));
    setKg('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.6 }}
        style={[styles.gradient, { paddingTop: insets.top + Spacing.sm }]}
      >
        {/* Brand row */}
        <View style={styles.brandRow}>
          <Image
            source={require('../../../assets/images/logo-tile.png')}
            style={styles.brandLogo}
            contentFit="contain"
          />
          <View style={{ flex: 1 }} />
          <View style={[styles.streakBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="flame" size={16} color="#FFD166" />
            <Text style={{ color: theme.onGradient, fontWeight: '800', fontSize: 14 }}>
              {streak}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            style={[styles.headerBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
          >
            <Ionicons name="person" size={18} color={theme.onGradient} />
          </Pressable>
        </View>

        {/* Day navigation */}
        <View style={styles.headerCenter}>
          <Pressable onPress={() => shift(-1)} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.9)" />
          </Pressable>
          <Pressable onPress={() => router.push('/calendar')} hitSlop={8} style={styles.headerDate}>
            <Text style={[styles.headerTitle, { color: theme.onGradient }]}>
              {selectedIsToday
                ? t('home.today')
                : selected.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
            </Text>
            <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.9)" />
          </Pressable>
          <Pressable onPress={() => shift(1)} hitSlop={12} disabled={selectedIsToday}>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={selectedIsToday ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)'}
            />
          </Pressable>
        </View>

        <View ref={weekRef} collapsable={false} style={styles.weekRow}>
          {days.map((day) => {
            const active = isSameDay(day.toISOString(), selected);
            return (
              <Pressable
                key={day.toDateString()}
                onPress={() => setDay(day)}
                style={[
                  styles.dayPill,
                  { backgroundColor: active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.18)' },
                ]}
              >
                <Text
                  style={[
                    styles.dayName,
                    { color: active ? theme.gradientEnd : 'rgba(255,255,255,0.85)' },
                  ]}
                >
                  {day.toLocaleDateString(locale, { weekday: 'narrow' })}
                </Text>
                <Text
                  style={[styles.dayNum, { color: active ? theme.gradientEnd : theme.onGradient }]}
                >
                  {day.toLocaleDateString(locale, { day: 'numeric' })}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroSide}>
            <Text style={[styles.heroSideValue, { color: theme.onGradient }]}>
              {Math.round(totals.calories)}
            </Text>
            <Text style={styles.heroSideLabel}>{t('home.eaten')}</Text>
          </View>

          <View ref={ringRef} collapsable={false}>
            <Ring
              size={150}
              strokeWidth={11}
              progress={targets.calories > 0 ? totals.calories / targets.calories : 0}
              color="rgba(255,255,255,0.95)"
              trackColor="rgba(255,255,255,0.25)"
            >
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.ringValue, { color: theme.onGradient }]}>
                  {Math.abs(Math.round(remaining))}
                </Text>
                <Text style={styles.heroSideLabel}>
                  {over ? `${t('common.kcal')} ${t('home.overTarget')}` : t('home.kcalLeft')}
                </Text>
              </View>
            </Ring>
          </View>

          <View style={styles.heroSide}>
            <Text style={[styles.heroSideValue, { color: theme.onGradient }]}>
              {targets.calories}
            </Text>
            <Text style={styles.heroSideLabel}>{t('home.goal')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Optional spotlight tour invite */}
        {!tourSeen && !tourSteps && (
          <Pressable
            onPress={startTour}
            style={({ pressed }) => [
              styles.tourBanner,
              { backgroundColor: theme.cardSubtle, borderColor: theme.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="sparkles" size={18} color={theme.primary} />
            <Text style={{ color: theme.primary, fontWeight: '700', flex: 1 }}>{t('tour.banner')}</Text>
            <Pressable onPress={setTourSeen} hitSlop={8}>
              <Ionicons name="close" size={18} color={theme.textTertiary} />
            </Pressable>
          </Pressable>
        )}

        {/* First-run getting-started checklist */}
        {showChecklist && (
          <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            <View style={styles.checklistHead}>
              <Ionicons name="rocket" size={18} color={theme.primary} />
              <Text style={[styles.cardTitle, { color: theme.text, flex: 1, marginBottom: 0 }]}>
                {t('checklist.title')}
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '700' }}>
                {t('checklist.progress', { done: checklistDone, total: checklist.length })}
              </Text>
              <Pressable onPress={dismissChecklist} hitSlop={8} style={{ padding: 2 }}>
                <Ionicons name="close" size={18} color={theme.textTertiary} />
              </Pressable>
            </View>
            <View style={{ marginTop: Spacing.sm }}>
              {checklist.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  style={({ pressed }) => [styles.checklistRow, pressed && { opacity: 0.6 }]}
                >
                  <View
                    style={[
                      styles.checkCircle,
                      item.done
                        ? { backgroundColor: theme.primary, borderColor: theme.primary }
                        : { borderColor: theme.border },
                    ]}
                  >
                    {item.done && <Ionicons name="checkmark" size={14} color={theme.onPrimary} />}
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      color: item.done ? theme.textTertiary : theme.text,
                      fontWeight: '600',
                      textDecorationLine: item.done ? 'line-through' : 'none',
                    }}
                  >
                    {t(`checklist.${item.key}`)}
                  </Text>
                  {!item.done && <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Macros */}
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <View style={styles.macroRow}>
            <MacroCol letterColor={theme.protein} label={t('home.protein')} value={totals.proteinG} target={targets.proteinG} />
            <MacroCol letterColor={theme.carbs} label={t('home.carbs')} value={totals.carbsG} target={targets.carbsG} />
            <MacroCol letterColor={theme.fat} label={t('home.fat')} value={totals.fatG} target={targets.fatG} />
          </View>
        </View>

        {/* Water + burned side by side */}
        <View style={styles.halfRow}>
          <Pressable
            onPress={() => router.push('/water')}
            disabled={!selectedIsToday}
            style={({ pressed }) => [
              styles.card,
              styles.half,
              { backgroundColor: theme.card },
              cardShadow(theme.shadow),
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <View style={styles.halfHead}>
              <Ionicons name="water" size={18} color={theme.water} />
              <Text style={[styles.halfTitle, { color: theme.text }]}>{t('home.water')}</Text>
              {selectedIsToday && (
                <View style={[styles.halfAdd, { backgroundColor: theme.cardSubtle }]}>
                  <Ionicons name="add" size={16} color={theme.primary} />
                </View>
              )}
            </View>
            <Text style={[styles.halfValue, { color: theme.text }]}>
              {waterMl}
              <Text style={[styles.halfTarget, { color: theme.textTertiary }]}>
                /{waterTarget} {t('home.ml')}
              </Text>
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/training')}
            style={({ pressed }) => [
              styles.card,
              styles.half,
              { backgroundColor: theme.card },
              cardShadow(theme.shadow),
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <View style={styles.halfHead}>
              <Ionicons name="flame" size={18} color={theme.carbs} />
              <Text style={[styles.halfTitle, { color: theme.text }]}>
                {t('training.burned')}
              </Text>
            </View>
            <Text style={[styles.halfValue, { color: theme.text }]}>
              {burned}
              <Text style={[styles.halfTarget, { color: theme.textTertiary }]}>
                {' '}
                {t('common.kcal')}
              </Text>
            </Text>
          </Pressable>
        </View>

        {/* Calories week chart */}
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.calories7d')}</Text>
          <WeekBars values={calValues} target={targets.calories} labels={chartLabels} color={theme.primary} />
        </View>

        {/* Weight */}
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.weight')}</Text>
          {weightSeries.length >= 2 ? (
            <TrendLine
              values={weightSeries}
              labels={weightLabels}
              color={theme.primary}
              width={width - Spacing.md * 4}
            />
          ) : (
            <Text style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
              {t('progress.noWeights')}
            </Text>
          )}
          <View style={styles.weightRow}>
            <View style={{ flex: 1 }}>
              <Field
                label={t('progress.logWeight')}
                value={kg}
                onChangeText={(t) => setKg(normalizeDigits(t))}
                keyboardType="decimal-pad"
                maxLength={5}
                suffix={t('progress.kg')}
              />
            </View>
            <Button label="+" onPress={submitWeight} style={styles.weightBtn} />
          </View>
        </View>

        <SponsorCard />
      </ScrollView>

      {tourSteps && (
        <CoachTour steps={tourSteps} index={tourIndex} onNext={advanceTour} onSkip={endTour} />
      )}
    </View>
  );
}

function MacroCol({
  letterColor,
  label,
  value,
  target,
}: {
  letterColor: string;
  label: string;
  value: number;
  target: number;
}) {
  const theme = useTheme();
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 14, marginBottom: 6 }}>
        <Text style={{ color: letterColor, fontWeight: '800' }}>{label.charAt(0)}</Text>
        <Text style={{ color: theme.text, fontWeight: '800' }}> {Math.round(value)}</Text>
        <Text style={{ color: theme.textTertiary }}>/{target}</Text>
      </Text>
      <View style={[styles.macroTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.macroFill, { backgroundColor: letterColor, width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  brandLogo: { width: 36, height: 36, borderRadius: 9 },
  headerCenter: {
    flexDirection: 'row',
    // Fixed LTR order: RN auto-mirrors 'row' for RTL, but the chevron glyphs
    // are static and don't flip with it, which points them the wrong way.
    // Locking this row to ltr keeps prev/next glyphs matching their meaning
    // in both languages.
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerDate: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: Spacing.lg,
  },
  dayPill: { flex: 1, alignItems: 'center', borderRadius: Radius.md, paddingVertical: 8, gap: 2 },
  dayName: { fontSize: 11, fontWeight: '600' },
  dayNum: { fontSize: 15, fontWeight: '700' },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
  },
  heroSide: { alignItems: 'center', width: 80 },
  heroSideValue: { fontSize: 24, fontWeight: '800' },
  heroSideLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  ringValue: { fontSize: 34, fontWeight: '800' },
  card: { borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.md },
  macroRow: { flexDirection: 'row', gap: Spacing.md },
  tourBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  checklistHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 9 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: 5, borderRadius: 3 },
  halfRow: { flexDirection: 'row', gap: Spacing.sm },
  half: { flex: 1 },
  halfHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  halfTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  halfAdd: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfValue: { fontSize: 20, fontWeight: '800' },
  halfTarget: { fontSize: 12, fontWeight: '600' },
  weightRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  weightBtn: { minWidth: 54, marginBottom: Spacing.md },
});
