import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ring } from '@/components/ring';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  isSameDay,
  mealCalories,
  streakDays,
  totalsForDay,
  useAppStore,
  waterForDay,
  waterTargetMl,
} from '@/lib/store';
import type { LoggedMeal, MealType } from '@/lib/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const GLASS_ML = 250;

function lastSevenDays(): Date[] {
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const profile = useAppStore((s) => s.profile);
  const targets = useAppStore((s) => s.targets);
  const meals = useAppStore((s) => s.meals);
  const water = useAppStore((s) => s.water);
  const removeMeal = useAppStore((s) => s.removeMeal);
  const logWater = useAppStore((s) => s.logWater);

  const [selected, setSelected] = useState<Date>(new Date());

  if (!targets || !profile) return null;

  const totals = totalsForDay(meals, selected);
  const remaining = targets.calories - totals.calories;
  const over = remaining < 0;
  const dayMeals = meals.filter((m) => isSameDay(m.at, selected));
  const waterMl = waterForDay(water, selected);
  const waterTarget = waterTargetMl(profile.weightKg);
  const selectedIsToday = isSameDay(new Date().toISOString(), selected);
  const streak = streakDays(meals);

  const shiftDay = (delta: number) => {
    const d = new Date(selected);
    d.setDate(d.getDate() + delta);
    if (d.getTime() > Date.now()) return;
    setSelected(d);
  };

  const mealsOfType = (type: MealType): LoggedMeal[] =>
    dayMeals.filter((m) => (m.mealType ?? 'snack') === type);

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
            onPress={() => router.push('/edit-profile')}
            style={[styles.headerBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
          >
            <Ionicons name="person" size={18} color={theme.onGradient} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Pressable onPress={() => shiftDay(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.85)" />
            </Pressable>
            <Text style={[styles.headerTitle, { color: theme.onGradient }]}>
              {selectedIsToday
                ? t('home.today')
                : selected.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
            </Text>
            <Pressable onPress={() => shiftDay(1)} hitSlop={10} disabled={selectedIsToday}>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={selectedIsToday ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)'}
              />
            </Pressable>
          </View>

          <View style={[styles.headerBtn, styles.streakBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="flame" size={16} color="#FFD166" />
            <Text style={{ color: theme.onGradient, fontWeight: '800', fontSize: 14 }}>{streak}</Text>
          </View>
        </View>

        {/* Week strip */}
        <View style={styles.weekRow}>
          {lastSevenDays().map((day) => {
            const active = isSameDay(day.toISOString(), selected);
            return (
              <Pressable
                key={day.toDateString()}
                onPress={() => setSelected(day)}
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

        {/* Calorie hero: eaten | ring | goal */}
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
        contentContainerStyle={{
          padding: Spacing.md,
          paddingBottom: 120 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Macro strip */}
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <View style={styles.macroRow}>
            <MacroCol
              letterColor={theme.protein}
              label={t('home.protein')}
              value={totals.proteinG}
              target={targets.proteinG}
            />
            <MacroCol
              letterColor={theme.carbs}
              label={t('home.carbs')}
              value={totals.carbsG}
              target={targets.carbsG}
            />
            <MacroCol
              letterColor={theme.fat}
              label={t('home.fat')}
              value={totals.fatG}
              target={targets.fatG}
            />
          </View>
        </View>

        {/* Water */}
        <View
          style={[
            styles.card,
            styles.waterCard,
            { backgroundColor: theme.card },
            cardShadow(theme.shadow),
          ]}
        >
          <View style={[styles.waterIcon, { backgroundColor: 'rgba(56,189,248,0.14)' }]}>
            <Ionicons name="water" size={22} color={theme.water} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.waterTitle, { color: theme.text }]}>{t('home.water')}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
              <Text style={{ color: theme.text, fontWeight: '800' }}>{waterMl}</Text>
              {' / '}
              {waterTarget} {t('home.ml')}
            </Text>
          </View>
          {selectedIsToday && (
            <Pressable
              onPress={() => {
                logWater(GLASS_ML);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [
                styles.waterAdd,
                { backgroundColor: theme.cardSubtle },
                pressed && { transform: [{ scale: 0.92 }] },
              ]}
            >
              <Ionicons name="add" size={22} color={theme.primary} />
            </Pressable>
          )}
        </View>

        {/* Meal sections */}
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
            <View
              key={type}
              style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}
            >
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
                  onPress={() => router.push('/add-menu')}
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
              {sectionMeals.map((meal) => (
                <Pressable key={meal.id} onLongPress={() => removeMeal(meal.id)}>
                  <View style={styles.mealRow}>
                    <View style={[styles.mealAvatar, { backgroundColor: theme.cardSubtle }]}>
                      <Ionicons name="restaurant" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={1}>
                        {meal.items.map((i) => i.name).join(' · ')}
                      </Text>
                      <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                        {new Date(meal.at).toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.mealKcal, { color: theme.primary }]}>
                      {Math.round(mealCalories(meal))}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })}
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
        <View
          style={[styles.macroFill, { backgroundColor: letterColor, width: `${pct * 100}%` }]}
        />
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
  dayPill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingVertical: 8,
    gap: 2,
  },
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
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  macroRow: { flexDirection: 'row', gap: Spacing.md },
  macroTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: 5, borderRadius: 3 },
  waterCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  waterIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  waterAdd: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
  empty: {
    marginBottom: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.sm,
  },
  mealAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  mealKcal: { fontSize: 17, fontWeight: '800' },
  fabBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  fabMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.full,
    paddingVertical: 16,
    minHeight: 54,
  },
  fabMainLabel: { fontSize: 16, fontWeight: '700' },
  fabRound: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
