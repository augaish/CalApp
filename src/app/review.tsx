import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { buildWeeklyReview, reviewSuggestions, type Suggestion } from '@/lib/review';
import { useAppStore } from '@/lib/store';

/** The last seven days including today. Module-level so the clock is never
 * read during render. */
function lastSevenDays(): Date[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
}

/**
 * What actually happened this week, and what to change.
 *
 * Every figure is built from records, and every average says how many days it
 * rests on. Where the week is half-empty this refuses to advise at all and
 * says so instead: a calorie recommendation drawn from three logged days out
 * of seven is a recommendation drawn from a gap.
 */
export default function Review() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();

  const meals = useAppStore((s) => s.meals);
  const workouts = useAppStore((s) => s.workouts);
  const weights = useAppStore((s) => s.weights);
  const targets = useAppStore((s) => s.targets);
  const goal = useAppStore((s) => s.profile?.goal);
  const setTargets = useAppStore((s) => s.setTargets);

  const [days] = useState(lastSevenDays);
  const [accepted, setAccepted] = useState(false);

  const review = useMemo(
    () => buildWeeklyReview(days, meals, workouts, weights, targets),
    [days, meals, workouts, weights, targets],
  );
  const suggestions = useMemo(() => reviewSuggestions(review, goal), [review, goal]);

  const accept = (s: Suggestion) => {
    if (!s.apply || !targets) return;
    setTargets({ ...targets, calories: s.apply.targetCalories });
    setAccepted(true);
    successHaptic();
  };

  const kcal = t('common.kcal');
  const g = t('common.grams');

  return (
    <Screen>
      <Title>{t('review.title')}</Title>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
        {t('review.range', {
          from: days[0].toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
          to: days[days.length - 1].toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
        })}
      </Text>

      {/* How much of the week this is actually based on. Stated first, because
          it decides how much anything below is worth. */}
      <Card style={{ gap: Spacing.sm }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('review.coverage')}</Text>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>
          {t('review.daysLogged', { logged: review.daysLogged, total: review.daysInRange })}
        </Text>
        <View style={[styles.track, { backgroundColor: theme.cardSubtle }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: review.coverage >= 0.5 ? theme.primary : theme.warning,
                width: `${Math.round(review.coverage * 100)}%`,
              },
            ]}
          />
        </View>
        {review.coverage < 1 && (
          <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('review.coverageNote')}</Text>
        )}
      </Card>

      {/* Food — averaged over logged days only, and it says so. */}
      <Card style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('review.food')}</Text>
        {review.avgCalories == null ? (
          <Text style={{ color: theme.textSecondary }}>{t('review.noFood')}</Text>
        ) : (
          <>
            <Row
              label={t('review.avgCalories')}
              value={`${Math.round(review.avgCalories)} ${kcal}`}
              sub={review.targetCalories ? t('review.ofTarget', { target: review.targetCalories }) : undefined}
              theme={theme}
            />
            <Row
              label={t('review.avgProtein')}
              value={`${Math.round(review.avgProteinG ?? 0)}${g}`}
              sub={review.targetProteinG ? t('review.ofTarget', { target: Math.round(review.targetProteinG) }) : undefined}
              theme={theme}
            />
            <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
              {t('review.averagedOver', { count: review.daysLogged })}
            </Text>
          </>
        )}
      </Card>

      {/* Training */}
      <Card style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
        <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('review.training')}</Text>
        <Row
          label={t('review.daysTrained')}
          value={`${review.daysTrained} / ${review.daysInRange}`}
          theme={theme}
        />
        <Row
          label={t('review.setsDone')}
          value={String(review.days.reduce((n, d) => n + d.setsDone, 0))}
          theme={theme}
        />
      </Card>

      {/* Weight, only when there is something real to compare. */}
      {review.weightDeltaKg != null && (
        <Card style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
          <Text style={[Type.caption, { color: theme.textSecondary }]}>{t('review.weight')}</Text>
          <Row
            label={t('review.change')}
            value={`${review.weightDeltaKg > 0 ? '+' : ''}${review.weightDeltaKg.toFixed(1)} ${t('progress.kg')}`}
            sub={t('review.weightFrom', {
              from: review.weightStartKg?.toFixed(1),
              to: review.weightEndKg?.toFixed(1),
            })}
            theme={theme}
          />
        </Card>
      )}

      {/* What to change. */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('review.whatToChange')}
      </Text>
      {suggestions.map((s, i) => (
        <Card key={`${s.kind}-${i}`} style={{ gap: Spacing.sm, marginBottom: Spacing.xs }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' }}>
            <Ionicons
              name={s.kind === 'onTrack' ? 'checkmark-circle' : 'bulb-outline'}
              size={18}
              color={s.kind === 'onTrack' ? theme.primary : theme.carbs}
            />
            <Text style={{ color: theme.text, flex: 1, lineHeight: 20 }}>
              {t(`review.suggest.${s.kind}`, s.values ?? {})}
            </Text>
          </View>
          {s.apply && (
            <Button
              label={
                accepted
                  ? t('review.applied')
                  : t('review.applyTarget', { target: s.apply.targetCalories })
              }
              icon="checkmark"
              variant="secondary"
              disabled={accepted}
              onPress={() => accept(s)}
            />
          )}
        </Card>
      ))}

      <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm }}>
        {t('review.footnote')}
      </Text>
    </Screen>
  );
}

function Row({
  label,
  value,
  sub,
  theme,
}: {
  label: string;
  value: string;
  sub?: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: theme.textSecondary, flex: 1 }}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: theme.text, fontWeight: '700' }}>{value}</Text>
        {!!sub && <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{sub}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track: { height: 8, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
});
