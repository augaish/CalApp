import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  BodyMap,
  BodyMapIntensityHint,
  BodyMapMetricSwitch,
  BodyMapStatusLegend,
  BodyMapViewSwitch,
  zoneIntensityFromSegmental,
  zoneStatusFromSegmental,
  type BodyMapMetric,
  type BodyMapView,
} from '@/components/body-map';
import { PageHeader } from '@/components/brand-header';
import { MetricTrend } from '@/components/charts';
import { ActionButton, Chip, EmptyState, InfoLine, SectionTitle } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatWeight, kgToDisplay, weightUnit } from '@/lib/units';
import { bmiFor, useAppStore } from '@/lib/store';
import type { WeightEntry } from '@/lib/types';

type Metric = 'weight' | 'bmi' | 'fat' | 'muscle' | 'waist';
const METRICS: Metric[] = ['weight', 'bmi', 'fat', 'muscle', 'waist'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * S23 Measurement detail/history — the chart and, beneath it, the same
 * points as a dated list with source and an edit route. Nothing here is
 * interpolated: a metric a reading did not carry is simply absent from
 * that row. BMI is labelled calculated; it is not a measured reading.
 */
export default function Measurements() {
  const { metric: metricParam } = useLocalSearchParams<{ metric?: string }>();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const units = useAppStore((s) => s.units);
  const profile = useAppStore((s) => s.profile);
  const weights = useAppStore((s) => s.weights);
  const deleteWeight = useAppStore((s) => s.deleteWeight);
  const [metric, setMetric] = useState<Metric>(METRICS.includes(metricParam as Metric) ? (metricParam as Metric) : 'weight');
  const [mapView, setMapView] = useState<BodyMapView>('front');
  const [mapMetric, setMapMetric] = useState<BodyMapMetric>('muscle');

  const valueOf = (w: WeightEntry): number | undefined => {
    switch (metric) {
      case 'weight':
        return Number(kgToDisplay(w.kg, units).toFixed(1));
      case 'bmi':
        return profile ? Number(bmiFor(w.kg, profile.heightCm).toFixed(1)) : undefined;
      case 'fat':
        return w.bodyFatPercent;
      case 'muscle':
        return w.skeletalMuscleMassKg != null && w.kg > 0 ? Number(((w.skeletalMuscleMassKg / w.kg) * 100).toFixed(1)) : undefined;
      case 'waist':
        return w.measurementsCm?.waist;
    }
  };
  const unit = metric === 'weight' ? weightUnit(units, t) : metric === 'waist' ? t('units.cm') : metric === 'bmi' ? '' : '%';
  const label = (m: Metric) =>
    m === 'weight' ? t('progress.weight') : m === 'bmi' ? t('progress.bmi') : m === 'fat' ? t('bodyReading.bodyFat') : m === 'muscle' ? t('progress.musclePercent') : t('bodyReading.waist');

  // Newest first in the store; the chart reads oldest → newest.
  const points = useMemo(() => weights.map((w) => ({ w, v: valueOf(w) })).filter((p): p is { w: WeightEntry; v: number } => p.v != null), [weights, metric, profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = [...points].reverse().slice(-12);
  const dateOf = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const sourceOf = (w: WeightEntry) =>
    w.source === 'scan' ? (w.reportLabel ? t('health.sourceScanNamed', { device: w.reportLabel }) : t('health.sourceScan')) : t('health.sourceManual');

  const latestSeg = weights.find((w) => w.segmentalLeanMassKg && zoneIntensityFromSegmental(w.segmentalLeanMassKg));
  const latestFatSeg = weights.find((w) => w.segmentalFatMassKg && zoneIntensityFromSegmental(w.segmentalFatMassKg));
  const zoneIntensity = zoneIntensityFromSegmental(latestSeg?.segmentalLeanMassKg);
  const fatZoneIntensity = zoneIntensityFromSegmental(latestFatSeg?.segmentalFatMassKg);
  const activeMap: BodyMapMetric = zoneIntensity == null && fatZoneIntensity != null ? 'fat' : mapMetric;
  const activeSeg = activeMap === 'fat' ? latestFatSeg?.segmentalFatMassKg : latestSeg?.segmentalLeanMassKg;
  const zoneLabels = activeSeg
    ? Object.fromEntries(Object.entries(activeSeg).map(([k, v]) => [k, v != null ? formatWeight(Number(v), units, t) : undefined]))
    : undefined;
  const activeStatus = zoneStatusFromSegmental(activeMap === 'fat' ? latestFatSeg?.segmentalFatMassStatus : latestSeg?.segmentalLeanMassStatus);

  const confirmDelete = (at: string) =>
    Alert.alert(t('bodyReading.deleteReadingConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteWeight(at) },
    ]);

  return (
    <Screen header={<PageHeader title={t('bodyReading.historyTitle')} />}>
      <View style={styles.chips}>
        {METRICS.map((m) => (
          <Chip key={m} label={label(m)} selected={metric === m} onPress={() => setMetric(m)} />
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '600' }}>{label(metric)}</Text>
        {points[0] ? (
          <>
            <Text style={{ color: theme.text, marginTop: 4 }}>
              <Text style={{ fontSize: 30, fontWeight: '800' }}>{points[0].v}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textSecondary }}> {unit}</Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
              {dateOf(points[0].w.at)} · {sourceOf(points[0].w)}
            </Text>
            {metric === 'bmi' && <InfoLine icon="calculator-outline">{t('bodyReading.calculated')}</InfoLine>}
            {series.length >= 2 ? (
              <View style={{ marginTop: Spacing.sm }}>
                <MetricTrend values={series.map((p) => p.v)} labels={series.map((p) => dateOf(p.w.at))} color={theme.primary} width={width - Spacing.page * 2 - Spacing.md * 2} />
              </View>
            ) : (
              <Text style={{ color: theme.textTertiary, fontSize: 13, marginTop: Spacing.sm }}>{t('health.needTwoForTrend')}</Text>
            )}
          </>
        ) : (
          <Text style={{ color: theme.textSecondary, marginTop: 6 }}>{t('health.noReadingYet')}</Text>
        )}
      </View>

      {(zoneIntensity || fatZoneIntensity) && (
        <View style={[styles.card, { backgroundColor: theme.card, alignItems: 'center' }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
            {activeMap === 'fat' ? t('bodyReading.compositionFat') : t('bodyReading.composition')}
          </Text>
          <BodyMap
            view={mapView}
            zoneIntensity={(activeMap === 'fat' ? fatZoneIntensity : zoneIntensity) ?? undefined}
            zoneStatus={activeStatus ?? undefined}
            zoneColor={activeMap === 'fat' ? theme.fat : theme.primary}
            zoneLabels={zoneLabels}
            size={150}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.lg, marginTop: Spacing.sm }}>
            {zoneIntensity && fatZoneIntensity && <BodyMapMetricSwitch metric={activeMap} onChange={setMapMetric} />}
            <BodyMapViewSwitch view={mapView} onChange={setMapView} />
          </View>
          <View style={{ marginTop: Spacing.sm }}>{activeStatus ? <BodyMapStatusLegend /> : <BodyMapIntensityHint />}</View>
          <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.sm }}>
            {dateOf((activeMap === 'fat' ? latestFatSeg : latestSeg)!.at)} · {sourceOf((activeMap === 'fat' ? latestFatSeg : latestSeg)!)}
          </Text>
        </View>
      )}

      <SectionTitle action={{ label: t('health.addReading'), icon: 'add', onPress: () => router.push('/body-reading') }}>{t('bodyReading.history')}</SectionTitle>
      {points.length === 0 ? (
        <EmptyState icon="scale-outline" title={t('health.noReadingYet')} body={t('bodyReading.noHistory')} action={{ label: t('health.addReading'), icon: 'add', onPress: () => router.push('/body-reading') }} />
      ) : (
        <>
          <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: Spacing.sm }}>{t('bodyReading.tableAlt')}</Text>
          <View style={[styles.list, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            {points.map(({ w, v }, i) => (
              <View key={w.at} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>
                    {new Date(w.at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                    {sourceOf(w)}
                    {w.editedAt ? ` · ${t('bodyReading.editedOn', { date: dateOf(w.editedAt) })}` : ''}
                  </Text>
                </View>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>
                  {v}
                  {unit ? ` ${unit}` : ''}
                </Text>
                <ActionButton label={t('bodyReading.edit')} variant="secondary" onPress={() => router.push(`/body-reading?date=${ymd(new Date(w.at))}`)} style={{ minHeight: 36, paddingHorizontal: 10 }} />
                <Pressable onPress={() => confirmDelete(w.at)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.delete')} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  list: { borderRadius: Radius.module, paddingHorizontal: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.ms },
});
