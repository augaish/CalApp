import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { DayStrip, IconTile } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { buildWeeklyReview, reviewSuggestions } from '@/lib/review';
import { dateKey, useAppStore } from '@/lib/store';

/** The last seven days including today. Module-level so the clock is never read during render. */
function lastSevenDays(): Date[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
}

/** One summary row: icon tile, eyebrow, headline, detail and a chevron into the source screen. */
function SummaryRow({
  icon,
  eyebrow,
  title,
  big,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title?: string;
  big?: { value: string; sub: string };
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}. ${title ?? big?.value ?? ''}. ${subtitle ?? big?.sub ?? ''}`}
      style={({ pressed }) => [styles.summary, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
    >
      <IconTile icon={icon} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[Type.eyebrow, { color: theme.textSecondary }]}>{eyebrow}</Text>
        {title ? (
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17, marginTop: 2 }}>{title}</Text>
        ) : null}
        {big ? (
          <>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 26, marginTop: 2 }}>{big.value}</Text>
            <Text style={{ color: theme.text, fontSize: 15 }}>{big.sub}</Text>
          </>
        ) : (
          !!subtitle && <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
        )}
      </View>
      <IconTile icon="chevron-forward" size={32} />
    </Pressable>
  );
}

/**
 * S17 Weekly review — an explicit rolling window, coverage by dimension and
 * every figure traceable to a record. Food averages use logged days only and
 * the screen says a logged day may still be incomplete. Training counts
 * actual sets. Body trends compare dated readings. A sparse week gets a
 * description, not a target; "Review next week" opens the goal editor as a
 * draft and changes nothing by itself.
 */
export default function Review() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();

  const meals = useAppStore((s) => s.meals);
  const workouts = useAppStore((s) => s.workouts);
  const weights = useAppStore((s) => s.weights);
  const targets = useAppStore((s) => s.targets);
  const goal = useAppStore((s) => s.profile?.goal);

  const [days] = useState(lastSevenDays);
  const [selected, setSelected] = useState(() => days[days.length - 1]);

  const review = useMemo(() => buildWeeklyReview(days, meals, workouts, weights, targets), [days, meals, workouts, weights, targets]);
  const suggestions = useMemo(() => reviewSuggestions(review, goal), [review, goal]);
  const setsTotal = review.days.reduce((n, d) => n + d.setsDone, 0);
  const selectedDay = review.days.find((d) => d.dateKey === dateKey(selected));
  const latestInRange = weights.find((w) => {
    const k = dateKey(new Date(w.at));
    return review.days.some((d) => d.dateKey === k);
  });
  const num = (n: number) => Math.round(n).toLocaleString(locale);
  const short = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const suggested = suggestions.find((s) => s.apply)?.apply?.targetCalories;

  return (
    <Screen
      header={<PageHeader title={t('review.weeklyTitle')} variant="plain" />}
      footer={
        <Button
          label={t('review.reviewNextWeek')}
          onPress={() => router.push(suggested ? `/edit-targets?suggested=${suggested}` : '/edit-targets')}
        />
      }
    >
      <Text style={[Type.title, { color: theme.text }]} accessibilityRole="header">
        {t('review.weeklyTitle')}
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: 16, marginTop: 2, marginBottom: Spacing.md }}>
        {t('review.lastSevenDays')} · {t('review.range', { from: short(days[0]), to: short(days[days.length - 1]) })}
      </Text>

      <DayStrip
        days={days}
        selected={selected}
        onSelect={(d) => {
          lightHaptic();
          setSelected(d);
        }}
        locale={locale}
      />
      <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: Spacing.sm, marginBottom: Spacing.md }}>
        {selected.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })} ·{' '}
        {selectedDay?.calories != null
          ? t('review.dayLogged', { kcal: num(selectedDay.calories), sets: selectedDay.setsDone })
          : selectedDay?.setsDone
            ? t('review.dayTrainedOnly', { sets: selectedDay.setsDone })
            : t('review.dayNothing')}
      </Text>

      <SummaryRow
        icon="restaurant-outline"
        eyebrow={t('review.food')}
        title={t('review.foodLoggedOn', { logged: review.daysLogged, total: review.daysInRange })}
        subtitle={t('review.missingNotZero')}
        onPress={() => router.push('/(tabs)/food')}
      />
      <SummaryRow
        icon="barbell-outline"
        eyebrow={t('review.training')}
        title={`${t('review.daysTrainedCount', { count: review.daysTrained })} · ${t('review.setsCount', { count: setsTotal })}`}
        subtitle={review.daysTrained === 0 ? t('review.noTraining') : undefined}
        onPress={() => router.push('/workout-history')}
      />
      {review.avgCalories == null ? (
        <SummaryRow icon="stats-chart-outline" eyebrow={t('review.nutrition')} title={t('review.noAverage')} subtitle={t('review.noFood')} onPress={() => router.push('/(tabs)/food')} />
      ) : (
        <SummaryRow
          icon="stats-chart-outline"
          eyebrow={t('review.nutrition')}
          subtitle={t('review.averageOnLogged')}
          big={{
            value: `${num(review.avgCalories)} ${t('common.kcal')}`,
            sub: `${num(review.avgProteinG ?? 0)} ${t('common.grams')} ${t('home.protein').toLowerCase()}`,
          }}
          onPress={() => router.push('/(tabs)/food')}
        />
      )}
      <SummaryRow
        icon="scale-outline"
        eyebrow={t('review.measurement')}
        title={latestInRange ? t('review.latestWeight', { kg: latestInRange.kg.toFixed(1) }) : t('review.noReadingInRange')}
        subtitle={
          latestInRange
            ? review.weightDeltaKg != null
              ? `${short(new Date(latestInRange.at))} · ${review.weightDeltaKg > 0 ? '+' : ''}${review.weightDeltaKg.toFixed(1)} ${t('progress.kg')} ${t('review.sinceStart')}`
              : short(new Date(latestInRange.at))
            : t('review.addReadingHint')
        }
        onPress={() => router.push(latestInRange ? '/measurements?metric=weight' : '/body-reading')}
      />

      {suggestions.map((s, i) => (
        <View key={`${s.kind}-${i}`} style={[styles.hint, { backgroundColor: theme.surfaceTint }]}>
          <Ionicons name={s.kind === 'onTrack' ? 'checkmark-circle' : 'bulb'} size={22} color={theme.primary} />
          <Text style={{ color: theme.primaryDark, fontSize: 15, lineHeight: 21, flex: 1 }}>{t(`review.suggest.${s.kind}`, s.values ?? {})}</Text>
        </View>
      ))}

      <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm }}>{t('review.footnote')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.ms },
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.sm },
});
