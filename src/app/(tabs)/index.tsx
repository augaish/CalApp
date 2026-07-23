import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { Ring } from '@/components/ring';
import { Button, Field } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timestampFor, useViewDay } from '@/lib/day';
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
  const { width } = useWindowDimensions();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const profile = useAppStore((s) => s.profile);
  const targets = useAppStore((s) => s.targets);
  const meals = useAppStore((s) => s.meals);
  const water = useAppStore((s) => s.water);
  const workouts = useAppStore((s) => s.workouts);
  const weights = useAppStore((s) => s.weights);
  const logWeight = useAppStore((s) => s.logWeight);

  const selected = useViewDay((s) => s.day);
  const setDay = useViewDay((s) => s.setDay);
  const shift = useViewDay((s) => s.shift);
  const [kg, setKg] = useState('');

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
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.push('/profile')}
            style={[styles.headerBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
          >
            <Ionicons name="person" size={18} color={theme.onGradient} />
          </Pressable>

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

          <View
            style={[styles.headerBtn, styles.streakBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
          >
            <Ionicons name="flame" size={16} color="#FFD166" />
            <Text style={{ color: theme.onGradient, fontWeight: '800', fontSize: 14 }}>
              {streak}
            </Text>
          </View>
        </View>

        <View style={styles.weekRow}>
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
                onChangeText={setKg}
                keyboardType="decimal-pad"
                maxLength={5}
                suffix={t('progress.kg')}
              />
            </View>
            <Button label="+" onPress={submitWeight} style={styles.weightBtn} />
          </View>
        </View>
      </ScrollView>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerDate: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBadge: { flexDirection: 'row', gap: 4, paddingHorizontal: 10 },
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
