import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useViewDay } from '@/lib/day';
import { useAppStore } from '@/lib/store';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function Calendar() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const day = useViewDay((s) => s.day);
  const setDay = useViewDay((s) => s.setDay);
  const workouts = useAppStore((s) => s.workouts);
  const meals = useAppStore((s) => s.meals);
  const [month, setMonth] = useState<Date>(startOfMonth(day));

  // Days that have activity, for the calendar dots.
  const workoutDays = useMemo(() => new Set(workouts.map((w) => dayKey(w.at))), [workouts]);
  const mealDays = useMemo(() => new Set(meals.map((m) => dayKey(m.at))), [meals]);

  const today = new Date();
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'narrow' }),
  );

  const pick = (d: Date) => {
    if (d.getTime() > today.getTime() && !sameDay(d, today)) return;
    setDay(d);
    router.back();
  };

  const changeMonth = (delta: number) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  };

  const nextMonthInFuture =
    new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() > today.getTime();

  return (
    <Pressable style={styles.backdrop} onPress={() => router.back()}>
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={[
          styles.sheet,
          { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.border }]} />

        <View style={styles.monthRow}>
          <Pressable onPress={() => changeMonth(-1)} hitSlop={10} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: theme.text }]}>
            {month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable
            onPress={() => changeMonth(1)}
            hitSlop={10}
            disabled={nextMonthInFuture}
            style={styles.monthArrow}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={nextMonthInFuture ? theme.border : theme.text}
            />
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {weekdayLabels.map((w, i) => (
            <Text key={i} style={[styles.weekday, { color: theme.textTertiary }]}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: theme.primary }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>{t('tabs.training')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: theme.carbs }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>{t('home.todaysMeals')}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={styles.cell} />;
            const isSelected = sameDay(d, day);
            const isToday = sameDay(d, today);
            const isFuture = d.getTime() > today.getTime() && !isToday;
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const hasWorkout = workoutDays.has(key);
            const hasMeal = mealDays.has(key);
            return (
              <Pressable
                key={i}
                onPress={() => pick(d)}
                disabled={isFuture}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isSelected && { backgroundColor: theme.primary },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.primary },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? theme.onPrimary
                        : isFuture
                          ? theme.textTertiary
                          : theme.text,
                      fontWeight: isSelected || isToday ? '700' : '500',
                    }}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                <View style={styles.dotRow}>
                  {hasWorkout && (
                    <View
                      style={[styles.dot, { backgroundColor: isSelected ? theme.onPrimary : theme.primary }]}
                    />
                  )}
                  {hasMeal && (
                    <View
                      style={[styles.dot, { backgroundColor: isSelected ? theme.onPrimary : theme.carbs }]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.md },
  monthRow: {
    flexDirection: 'row',
    // Fixed LTR order: RN auto-mirrors 'row' for RTL, but the chevron
    // glyphs are static and don't flip with it. See Overview headerCenter.
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  monthArrow: { padding: 4 },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, marginBottom: Spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRow: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
