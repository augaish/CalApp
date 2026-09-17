import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BrandHeader } from '@/components/brand-header';
import { MetricTrend } from '@/components/charts';
import { useWhoopStatus } from '@/components/connections';
import { Chip, IconTile, RowGroup, SettingsRow } from '@/components/system';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatWeight, formatWeightDelta, kgToDisplay, weightUnit } from '@/lib/units';
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
 * S03 Health — the home for body data.
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
  const units = useAppStore((s) => s.units);
  const weights = useAppStore((s) => s.weights);
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [pickingRange, setPickingRange] = useState(false);
  const [whoop] = useWhoopStatus();

  const now = new Date();
  const latest = weights[0];
  const series = inRange(weights, range, now);
  // Change over the window, from the first reading inside it, not from an
  // arbitrary "previous" — the pill states exactly what the delta is.
  const first = series[0];
  const delta = latest && first && first.at !== latest.at ? latest.kg - first.kg : undefined;

  const measured = latestWith(weights, 'measurementsCm');
  const composition = weights.find((w) => w.bodyFatPercent != null || w.skeletalMuscleMassKg != null);

  const dateOf = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const sourceOf = (w: WeightEntry) =>
    w.source === 'scan' ? (w.reportLabel ? t('health.sourceScanNamed', { device: w.reportLabel }) : t('health.sourceScan')) : t('health.sourceManual');

  const exportData = async () => {
    try {
      await Share.share({ message: buildExport() });
    } catch {
      // The share sheet was dismissed; nothing to report.
    }
  };

  return (
    <Screen header={<BrandHeader title={t('health.title')} />}>
      {/* Range: independent of the diary's selected date (section 3). */}
      <View style={styles.titleRow}>
        <Text style={[Type.section, { color: theme.text, flex: 1 }]}>{t('health.trendsTitle')}</Text>
        <Pressable
          onPress={() => setPickingRange((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t('health.lastDays', { days: range })}
          style={({ pressed }) => [styles.rangePill, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="calendar-outline" size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('health.lastDays', { days: range })}</Text>
          <Ionicons name={pickingRange ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textTertiary} />
        </Pressable>
      </View>
      {pickingRange && (
        <View style={styles.ranges}>
          {RANGES.map((d) => (
            <Chip
              key={d}
              label={t('health.lastDays', { days: d })}
              selected={range === d}
              onPress={() => {
                setRange(d);
                setPickingRange(false);
              }}
            />
          ))}
        </View>
      )}

      {/* Weight */}
      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <View style={styles.rowHead}>
          <IconTile icon="scale-outline" size={32} />
          <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: '600', flex: 1 }}>{t('health.weight')}</Text>
          {delta != null && (
            // Neutral ink on purpose: a change is a fact, not a verdict.
            <View style={[styles.deltaPill, { backgroundColor: theme.surfaceTint }]}>
              <Text style={{ color: theme.primaryDark, fontSize: 13 }}>
                <Text style={{ fontWeight: '800' }}>
                  {formatWeightDelta(delta, units, t)}
                </Text>{' '}
                {t('health.since', { date: dateOf(first.at) })}
              </Text>
            </View>
          )}
        </View>
        {latest ? (
          <>
            <Text style={{ color: theme.text, marginTop: 6 }}>
              <Text style={styles.big}>{kgToDisplay(latest.kg, units).toFixed(1).replace(/\.0$/, '')}</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textSecondary }}> {weightUnit(units, t)}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }}>
              {dateOf(latest.at)} · {sourceOf(latest)}
            </Text>
            {series.length >= 2 ? (
              <View style={{ marginTop: Spacing.sm }}>
                <MetricTrend
                  values={series.map((w) => Number(kgToDisplay(w.kg, units).toFixed(1)))}
                  labels={series.map((w) => dateOf(w.at))}
                  color={theme.primary}
                  width={width - Spacing.page * 2 - Spacing.md * 2}
                />
                <Pressable onPress={() => router.push('/measurements?metric=weight')} accessibilityRole="button" hitSlop={6} style={styles.historyLink}>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('health.readingsInRange', { n: series.length })}</Text>
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>{t('bodyReading.history')}</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.primary} />
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: theme.textTertiary, fontSize: 13, marginTop: Spacing.sm }}>{t('health.needTwoForTrend')}</Text>
            )}
          </>
        ) : (
          <Text style={{ color: theme.textSecondary, marginTop: 6 }}>{t('health.noReadings')}</Text>
        )}
        <Button label={t('health.addReading')} icon="add" onPress={() => router.push('/body-reading')} style={{ marginTop: Spacing.md }} />
      </View>

      <RowGroup>
        <SettingsRow
          icon="resize-outline"
          title={t('health.measurements')}
          subtitle={
            measured?.measurementsCm?.waist != null
              ? `${t('health.waist')} · ${measured.measurementsCm.waist} cm · ${dateOf(measured.at)}`
              : t('health.noReadingYet')
          }
          onPress={() => router.push(measured ? '/measurements?metric=waist' : '/body-reading')}
        />
        <SettingsRow
          icon="body-outline"
          title={t('health.composition')}
          subtitle={
            composition
              ? [
                  composition.bodyFatPercent != null ? `${t('health.bodyFat')} ${composition.bodyFatPercent}%` : null,
                  composition.skeletalMuscleMassKg != null ? `${t('health.muscle')} ${formatWeight(composition.skeletalMuscleMassKg, units, t)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') + ` · ${dateOf(composition.at)}`
              : t('health.noReadingYet')
          }
          onPress={() => router.push(composition ? '/measurements?metric=fat' : '/body-reading')}
          chevron={!!composition}
          right={
            composition ? undefined : (
              <View style={[styles.addPill, { backgroundColor: theme.surfaceTint }]}>
                <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 13 }}>{t('health.add')}</Text>
              </View>
            )
          }
        />
        <SettingsRow
          icon="link-outline"
          title={t('profile.connections')}
          subtitle={`${t('profile.whoop')} · ${
            whoop === 'connected' ? t('profile.whoopConnected') : whoop === 'loading' ? t('common.loading') : t('health.notConnected')
          }`}
          onPress={() => router.push('/connections')}
        />
        <SettingsRow icon="stats-chart-outline" title={t('review.title')} subtitle={t('health.reviewShort')} onPress={() => router.push('/review')} />
        <SettingsRow icon="document-text-outline" title={t('legal.exportData')} subtitle={t('health.exportShort')} onPress={exportData} last />
      </RowGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  rangePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: Radius.control, borderWidth: 1 },
  ranges: { flexDirection: 'row', gap: 6, marginBottom: Spacing.md, flexWrap: 'wrap' },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  deltaPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.control },
  addPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.control },
  big: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 32 },
});
