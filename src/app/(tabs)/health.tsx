import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TrendLine } from '@/components/charts';
import { ConnectionRow, WhoopConnectionRow, connectionStyles } from '@/components/connections';
import { Button, Card, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildExport } from '@/lib/account';
import { useAppStore } from '@/lib/store';
import type { WeightEntry } from '@/lib/types';

const RANGES = [30, 90, 365] as const;

/** Readings inside the window, oldest first — the order a trend reads in. */
function inRange(weights: WeightEntry[], days: number, now: Date): WeightEntry[] {
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return weights
    .filter((w) => new Date(w.at).getTime() >= from.getTime() && new Date(w.at).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** The most recent reading that carries a given field, if any. */
function latestWith<K extends keyof WeightEntry>(weights: WeightEntry[], key: K): WeightEntry | undefined {
  return weights.find((w) => w[key] != null);
}

/**
 * Health — the home for body data (S03).
 *
 * Every number here shows the date it was measured and where it came from,
 * because a reading shown today is not a reading taken today. Missing values
 * stay missing: a metric with no reading says so and offers the one action
 * that fixes it, rather than printing a zero or a made-up composite score.
 * A falling weight is information, not a success; the trend is drawn in the
 * brand colour, never green or red.
 */
export default function Health() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // `weights` is kept newest-first by the store (see logWeight).
  const weights = useAppStore((s) => s.weights);
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);

  const now = new Date();
  const latest = weights[0];
  const series = inRange(weights, range, now);
  // Change over the window, from the first reading inside it, not from an
  // arbitrary "previous" — the range chip states exactly what the delta is.
  const first = series[0];
  const delta = latest && first && first.at !== latest.at ? latest.kg - first.kg : undefined;

  const measured = latestWith(weights, 'measurementsCm');
  const composition = weights.find((w) => w.bodyFatPercent != null || w.skeletalMuscleMassKg != null);

  const dateOf = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const sourceOf = (w: WeightEntry) =>
    w.source === 'scan'
      ? w.reportLabel
        ? t('health.sourceScanNamed', { device: w.reportLabel })
        : t('health.sourceScan')
      : t('health.sourceManual');

  const exportData = async () => {
    try {
      await Share.share({ message: buildExport() });
    } catch {
      // The share sheet was dismissed; nothing to report.
    }
  };

  return (
    <Screen>
      <Title>{t('health.title')}</Title>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>{t('health.subtitle')}</Text>

      {/* Range: independent of the diary's selected date (section 3). */}
      <View style={styles.ranges}>
        {RANGES.map((d) => {
          const on = range === d;
          return (
            <Pressable
              key={d}
              onPress={() => setRange(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { backgroundColor: on ? theme.primary : theme.cardSubtle }]}
            >
              <Text style={{ color: on ? theme.onPrimary : theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
                {t('health.lastDays', { days: d })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Weight */}
      <Card>
        <View style={styles.rowHead}>
          <Ionicons name="scale-outline" size={18} color={theme.primary} />
          <Text style={[styles.rowTitle, { color: theme.textSecondary }]}>{t('health.weight')}</Text>
        </View>
        {latest ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={[styles.big, { color: theme.text }]}>{latest.kg}</Text>
              <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{t('progress.kg')}</Text>
              {delta != null && (
                // Neutral ink on purpose: a change is a fact, not a verdict.
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginStart: 8 }}>
                  {t('health.sinceFirst', {
                    delta: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
                    date: dateOf(first.at),
                  })}
                </Text>
              )}
            </View>
            <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: 2 }}>
              {dateOf(latest.at)} · {sourceOf(latest)}
            </Text>
            {series.length >= 2 ? (
              <View style={{ marginTop: Spacing.sm }}>
                <TrendLine
                  values={series.map((w) => w.kg)}
                  labels={series.map((w) => dateOf(w.at))}
                  color={theme.primary}
                  width={width - Spacing.md * 4}
                />
                <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                  {t('health.readingsInRange', { n: series.length })}
                </Text>
              </View>
            ) : (
              <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>
                {t('health.needTwoForTrend')}
              </Text>
            )}
          </>
        ) : (
          <Text style={{ color: theme.textSecondary, marginTop: 4 }}>{t('health.noReadings')}</Text>
        )}
        <Button
          label={t('health.addReading')}
          icon="add"
          onPress={() => router.push('/body-reading')}
          style={{ marginTop: Spacing.md }}
        />
      </Card>

      {/* Measurements */}
      <Pressable onPress={() => router.push('/body-reading')} accessibilityRole="button">
        <Card style={styles.linkRow}>
          <Ionicons name="resize-outline" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{t('health.measurements')}</Text>
            <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
              {measured?.measurementsCm?.waist != null
                ? `${t('health.waist')} · ${measured.measurementsCm.waist} cm · ${dateOf(measured.at)}`
                : t('health.noReadingYet')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Card>
      </Pressable>

      {/* Body composition */}
      <Pressable onPress={() => router.push('/body-reading')} accessibilityRole="button">
        <Card style={styles.linkRow}>
          <Ionicons name="body-outline" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{t('health.composition')}</Text>
            <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
              {composition
                ? [
                    composition.bodyFatPercent != null ? `${t('health.bodyFat')} ${composition.bodyFatPercent}%` : null,
                    composition.skeletalMuscleMassKg != null
                      ? `${t('health.muscle')} ${composition.skeletalMuscleMassKg} ${t('progress.kg')}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') + ` · ${dateOf(composition.at)}`
                : t('health.noReadingYet')}
            </Text>
          </View>
          {composition ? (
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          ) : (
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{t('health.add')}</Text>
          )}
        </Card>
      </Pressable>

      {/* Connections */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: 6 }]}>
        {t('profile.connections')}
      </Text>
      <Card>
        <WhoopConnectionRow />
        <View style={[connectionStyles.divider, { backgroundColor: theme.border }]} />
        <ConnectionRow icon="watch-outline" label={t('profile.appleHealth')} />
      </Card>

      {/* Review + export */}
      <Pressable onPress={() => router.push('/review')} accessibilityRole="button">
        <Card style={styles.linkRow}>
          <Ionicons name="stats-chart-outline" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{t('review.title')}</Text>
            <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('health.reviewHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Card>
      </Pressable>
      <Pressable onPress={exportData} accessibilityRole="button">
        <Card style={styles.linkRow}>
          <Ionicons name="download-outline" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{t('legal.exportData')}</Text>
            <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{t('health.exportHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ranges: { flexDirection: 'row', gap: 6, marginBottom: Spacing.md },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  rowTitle: { fontSize: 13, fontWeight: '600' },
  big: { fontSize: 34, fontWeight: '800' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
