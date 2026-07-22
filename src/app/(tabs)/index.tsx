import { Ionicons } from '@expo/vector-icons';
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
  totalsForDay,
  useAppStore,
  waterForDay,
  waterTargetMl,
} from '@/lib/store';

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

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.6 }}
        style={[styles.gradient, { paddingTop: insets.top + Spacing.sm }]}
      >
        <Text style={[styles.headerTitle, { color: theme.onGradient }]}>
          {selectedIsToday
            ? t('home.today')
            : selected.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
        </Text>

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
              onPress={() => logWater(GLASS_ML)}
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

        {/* Meals */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home.todaysMeals')}</Text>
        {dayMeals.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <Ionicons name="camera-outline" size={36} color={theme.textTertiary} />
            <Text style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 22 }}>
              {t('home.noMeals')}
            </Text>
          </View>
        ) : (
          dayMeals.map((meal) => (
            <Pressable key={meal.id} onLongPress={() => removeMeal(meal.id)}>
              <View
                style={[
                  styles.card,
                  styles.mealCard,
                  { backgroundColor: theme.card },
                  cardShadow(theme.shadow),
                ]}
              >
                <View style={[styles.mealAvatar, { backgroundColor: theme.cardSubtle }]}>
                  <Ionicons name="restaurant" size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mealName, { color: theme.text }]} numberOfLines={1}>
                    {meal.items.map((i) => i.name).join(' · ')}
                  </Text>
                  <Text style={{ color: theme.textTertiary, fontSize: 13 }}>
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
          ))
        )}
      </ScrollView>

      {/* Floating action bar */}
      <View style={[styles.fabBar, { bottom: insets.bottom + Spacing.md }]}>
        <Pressable
          onPress={() => router.push('/scan?mode=meal')}
          style={({ pressed }) => [
            styles.fabMain,
            { backgroundColor: theme.text },
            cardShadow(theme.shadow),
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Ionicons name="camera" size={22} color={theme.background} />
          <Text style={[styles.fabMainLabel, { color: theme.background }]}>
            {t('home.scanMeal')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/scan?mode=gym')}
          style={({ pressed }) => [
            styles.fabRound,
            { backgroundColor: theme.card },
            cardShadow(theme.shadow),
            pressed && { transform: [{ scale: 0.92 }] },
          ]}
        >
          <Ionicons name="barbell" size={24} color={theme.text} />
        </Pressable>
      </View>
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
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
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  empty: {
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
