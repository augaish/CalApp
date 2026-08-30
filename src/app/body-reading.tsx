import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
import { TrendLine } from '@/components/charts';
import { DatePickerModal } from '@/components/date-picker';
import { TargetUpdateModal } from '@/components/target-update-modal';
import { Button, Card, Field, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeBodyReading, ApiError, FeatureLockedError, QuotaError } from '@/lib/api';
import { documentPickerAvailable, pickReportBase64 } from '@/lib/document-picker';
import { useEntitlement } from '@/lib/entitlement';
import { successHaptic } from '@/lib/feedback';
import { normalizeDigits } from '@/lib/numbers';
import { usePending } from '@/lib/pending';
import { targetsNeedUpdate } from '@/lib/tdee';
import {
  bmiFor,
  bmiTrend,
  bodyFatTrend,
  bodyStatsFor,
  type MetricTrend,
  muscleTrend,
  useAppStore,
  weightTrend,
} from '@/lib/store';
import type { BodyReadingAnalysis, SegmentalStatus, WeightEntry } from '@/lib/types';

/** A YYYY-MM-DD string, local time, so "today" means today regardless of UTC offset. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A YYYY-MM-DD string → an ISO timestamp at local noon (a report gives a
 * date, never a time, and noon avoids any timezone rounding into "yesterday"
 * or "tomorrow" when displayed). Falls back to right now if unparseable. */
function isoFromDateInput(v: string): string {
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return new Date().toISOString();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** A single centered fat%/muscle% readout under the composition map — not
 * MetricRow's label-left/value-right list layout, which reads like a copy
 * of Overview's compact card rather than this page's own detail view. */
function CompositionStat({
  label,
  value,
  delta,
  trend,
  theme,
}: {
  label: string;
  value: string;
  delta?: number;
  trend: MetricTrend;
  theme: ReturnType<typeof useTheme>;
}) {
  const color = trend === 'good' ? theme.success : trend === 'bad' ? theme.danger : theme.warning;
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: theme.textSecondary }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{value}</Text>
        {delta != null && Math.abs(delta) > 0.01 && (
          <Ionicons name={delta > 0 ? 'caret-up' : 'caret-down'} size={12} color={color} />
        )}
      </View>
    </View>
  );
}

/** Manual entry and scan-review in one screen: a scan just pre-fills these
 * same editable fields rather than jumping to a separate confirm screen —
 * numbers feeding future targets/programs always get a human look before
 * they're saved, never auto-committed from OCR. */
export default function BodyReading() {
  const { fromScan } = useLocalSearchParams<{ fromScan?: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-US';

  const language = useAppStore((s) => s.language) ?? 'en';
  const profile = useAppStore((s) => s.profile);
  const weights = useAppStore((s) => s.weights);
  const logBodyReading = useAppStore((s) => s.logBodyReading);
  const deleteWeight = useAppStore((s) => s.deleteWeight);
  const [pendingWeightKg, setPendingWeightKg] = useState<number | null>(null);
  const bodyReading = usePending((s) => s.bodyReading);
  const photoUri = usePending((s) => s.photoUri);
  const clearPending = usePending((s) => s.clear);

  // A fresh scan hands off exactly one BodyReadingAnalysis before landing
  // here, so the form's own initial state is the right place to consume it
  // — a route param never changes after mount, so a lazy initializer covers
  // it without an effect.
  const scanned = fromScan === '1' ? bodyReading : null;
  const scannedSeg = scanned?.segmentalLeanMassKg;
  const hasScannedSeg = !!scannedSeg && Object.values(scannedSeg).some((v) => v != null);
  const scannedFatSeg = scanned?.segmentalFatMassKg;
  const hasScannedFatSeg = !!scannedFatSeg && Object.values(scannedFatSeg).some((v) => v != null);

  const [kg, setKg] = useState(scanned?.weightKg != null ? String(scanned.weightKg) : '');
  const [bodyFat, setBodyFat] = useState(scanned?.bodyFatPercent != null ? String(scanned.bodyFatPercent) : '');
  const [muscleMass, setMuscleMass] = useState(
    scanned?.skeletalMuscleMassKg != null ? String(scanned.skeletalMuscleMassKg) : '',
  );
  const [segmental, setSegmental] = useState<Record<'leftArm' | 'rightArm' | 'trunk' | 'leftLeg' | 'rightLeg', string>>(
    () => ({
      leftArm: scannedSeg?.leftArm != null ? String(scannedSeg.leftArm) : '',
      rightArm: scannedSeg?.rightArm != null ? String(scannedSeg.rightArm) : '',
      trunk: scannedSeg?.trunk != null ? String(scannedSeg.trunk) : '',
      leftLeg: scannedSeg?.leftLeg != null ? String(scannedSeg.leftLeg) : '',
      rightLeg: scannedSeg?.rightLeg != null ? String(scannedSeg.rightLeg) : '',
    }),
  );
  const [showSegmental, setShowSegmental] = useState(hasScannedSeg);
  const [segmentalFat, setSegmentalFat] = useState<Record<'leftArm' | 'rightArm' | 'trunk' | 'leftLeg' | 'rightLeg', string>>(
    () => ({
      leftArm: scannedFatSeg?.leftArm != null ? String(scannedFatSeg.leftArm) : '',
      rightArm: scannedFatSeg?.rightArm != null ? String(scannedFatSeg.rightArm) : '',
      trunk: scannedFatSeg?.trunk != null ? String(scannedFatSeg.trunk) : '',
      leftLeg: scannedFatSeg?.leftLeg != null ? String(scannedFatSeg.leftLeg) : '',
      rightLeg: scannedFatSeg?.rightLeg != null ? String(scannedFatSeg.rightLeg) : '',
    }),
  );
  const [showSegmentalFat, setShowSegmentalFat] = useState(hasScannedFatSeg);
  // Purely descriptive — never user-edited, since we have no reference
  // range to recompute it from ourselves. Only ever set from a report's own
  // printed classification (a fresh scan, or loading a past saved reading).
  const [segmentalStatus, setSegmentalStatus] = useState<SegmentalStatus | undefined>(scanned?.segmentalLeanMassStatus);
  const [segmentalFatStatus, setSegmentalFatStatus] = useState<SegmentalStatus | undefined>(scanned?.segmentalFatMassStatus);
  const [mapView, setMapView] = useState<BodyMapView>('front');
  const [metric, setMetric] = useState<BodyMapMetric>('muscle');
  const [deviceLabel, setDeviceLabel] = useState(scanned?.deviceLabel);
  const [source, setSource] = useState<'manual' | 'scan'>(scanned ? 'scan' : 'manual');
  const [lowConfidence, setLowConfidence] = useState(scanned != null && scanned.confidence < 0.5);
  // Defaults to today; a fresh scan can override it with the date actually
  // printed on the report, and it stays freely editable either way — the
  // whole point of importing an old PDF is that it isn't today's reading.
  const [date, setDate] = useState(scanned?.testDate ?? ymd(new Date()));
  // Set only when a PDF (not the camera) produced the current fields, so the
  // confirmation card can show a document icon instead of a photo thumbnail.
  const [pdfName, setPdfName] = useState<string | undefined>(undefined);
  const [uploadStage, setUploadStage] = useState<'idle' | 'picking' | 'analyzing' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const recent = useMemo(() => weights.slice(0, 6), [weights]);
  // Trend charts are "as of" whatever date is currently loaded on the form
  // — scrubbing to a past date via the date picker should visibly change
  // what the charts show, same as the composition map above already does.
  const asOfTime = useMemo(() => new Date(isoFromDateInput(date)).getTime(), [date]);
  const visibleWeights = useMemo(() => weights.filter((w) => new Date(w.at).getTime() <= asOfTime), [weights, asOfTime]);
  const trendSeries = useMemo(() => [...visibleWeights].slice(0, 8).reverse(), [visibleWeights]);
  const weightSeries = trendSeries.map((w) => w.kg);
  const weightLabels = trendSeries.map((w) =>
    new Date(w.at).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }),
  );
  const dateLabel = (at: string) => new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' });
  const bmiSeries = profile ? trendSeries.map((w) => bmiFor(w.kg, profile.heightCm)) : [];
  const bodyFatPoints = useMemo(
    () => [...visibleWeights].filter((w) => w.bodyFatPercent != null).slice(0, 8).reverse(),
    [visibleWeights],
  );
  const bodyFatSeries = bodyFatPoints.map((w) => w.bodyFatPercent!);
  const bodyFatLabels = bodyFatPoints.map((w) => dateLabel(w.at));
  const musclePoints = useMemo(
    () => [...visibleWeights].filter((w) => w.skeletalMuscleMassKg != null && w.kg > 0).slice(0, 8).reverse(),
    [visibleWeights],
  );
  const muscleSeries = musclePoints.map((w) => (w.skeletalMuscleMassKg! / w.kg) * 100);
  const muscleLabels = musclePoints.map((w) => dateLabel(w.at));

  // Each chart's line is colored by whether the whole visible window is
  // trending the right way — first point vs. last point, not just the last
  // two (which can read as flat even when the chart clearly isn't, e.g. two
  // identical back-to-back weigh-ins) — green/amber/red, same read as the
  // Overview card's arrows, rather than one flat brand color that says
  // nothing about direction.
  const trendColor = (trend: MetricTrend) =>
    trend === 'good' ? theme.success : trend === 'bad' ? theme.danger : theme.warning;
  const weightLineTrend: MetricTrend =
    profile && weightSeries.length >= 2 ? weightTrend(weightSeries.at(-1)! - weightSeries[0], profile.goal) : 'neutral';
  const bmiLineTrend: MetricTrend =
    profile && bmiSeries.length >= 2 ? bmiTrend(bmiSeries.at(-1)! - bmiSeries[0], profile.goal) : 'neutral';
  const bodyFatLineTrend: MetricTrend =
    bodyFatSeries.length >= 2 ? bodyFatTrend(bodyFatSeries.at(-1)! - bodyFatSeries[0]) : 'neutral';
  const muscleLineTrend: MetricTrend =
    muscleSeries.length >= 2 ? muscleTrend(muscleSeries.at(-1)! - muscleSeries[0]) : 'neutral';

  // Builds a chat-ready summary of the latest reading (with deltas vs the
  // one before it, when there is one) and hands it to the coach as an
  // opening question — the coach already gets the bare latest numbers with
  // every message (see coach-context.ts), but the trend deltas here aren't
  // part of that, and reading them out loud in the chat gives the user
  // something concrete to follow along with.
  const askCoach = () => {
    const latest = weights[0];
    if (!latest) return;
    const previous = weights[1];
    const delta = (value: number | undefined, decimals = 1) => {
      if (value == null || Math.abs(value) < 0.05) return '';
      return ` (${value > 0 ? '↑' : '↓'}${Math.abs(value).toFixed(decimals)})`;
    };
    const lines = [
      `${t('progress.weight')}: ${latest.kg} ${t('progress.kg')}${delta(previous ? latest.kg - previous.kg : undefined)}`,
    ];
    if (profile) {
      const bmiNow = bmiFor(latest.kg, profile.heightCm);
      const bmiPrev = previous ? bmiFor(previous.kg, profile.heightCm) : undefined;
      lines.push(`${t('progress.bmi')}: ${bmiNow.toFixed(1)}${delta(bmiPrev != null ? bmiNow - bmiPrev : undefined)}`);
    }
    if (latest.bodyFatPercent != null) {
      const prevFat = previous?.bodyFatPercent;
      lines.push(
        `${t('bodyReading.bodyFat')}: ${latest.bodyFatPercent}%${delta(prevFat != null ? latest.bodyFatPercent - prevFat : undefined)}`,
      );
    }
    if (latest.skeletalMuscleMassKg != null) {
      const musclePct = (latest.skeletalMuscleMassKg / latest.kg) * 100;
      const prevMusclePct =
        previous?.skeletalMuscleMassKg != null && previous.kg ? (previous.skeletalMuscleMassKg / previous.kg) * 100 : undefined;
      lines.push(
        `${t('progress.musclePercent')}: ${musclePct.toFixed(0)}%${delta(prevMusclePct != null ? musclePct - prevMusclePct : undefined)}`,
      );
    }
    if (profile) lines.push(`${t('onboarding.goalTitle')} ${t(`onboarding.goals.${profile.goal}`)}`);
    const message = `${t('bodyReading.coachPromptIntro')}\n\n${lines.join('\n')}\n\n${t('bodyReading.coachPromptQuestion')}`;
    router.push(`/coach?prompt=${encodeURIComponent(message)}`);
  };

  const num = (v: string) => {
    const n = Number(normalizeDigits(v));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // The composition map prefers whatever segmental numbers are on screen
  // right now (fresh scan, or mid manual entry) and falls back to the most
  // recent saved reading that had a segmental breakdown, so a return visit
  // with a blank form still shows something.
  const liveSeg = {
    leftArm: num(segmental.leftArm),
    rightArm: num(segmental.rightArm),
    trunk: num(segmental.trunk),
    leftLeg: num(segmental.leftLeg),
    rightLeg: num(segmental.rightLeg),
  };
  const latestSavedSeg = weights.find((w) => w.segmentalLeanMassKg && zoneIntensityFromSegmental(w.segmentalLeanMassKg));
  const compositionSeg = Object.values(liveSeg).some((v) => v != null) ? liveSeg : latestSavedSeg?.segmentalLeanMassKg;
  const zoneIntensity = zoneIntensityFromSegmental(compositionSeg);

  // Same idea, for the separate fat-mass-by-zone breakdown some fuller
  // reports also print — its own diagram on the report, its own toggle here.
  const liveFatSeg = {
    leftArm: num(segmentalFat.leftArm),
    rightArm: num(segmentalFat.rightArm),
    trunk: num(segmentalFat.trunk),
    leftLeg: num(segmentalFat.leftLeg),
    rightLeg: num(segmentalFat.rightLeg),
  };
  const latestSavedFatSeg = weights.find((w) => w.segmentalFatMassKg && zoneIntensityFromSegmental(w.segmentalFatMassKg));
  const compositionFatSeg = Object.values(liveFatSeg).some((v) => v != null) ? liveFatSeg : latestSavedFatSeg?.segmentalFatMassKg;
  const fatZoneIntensity = zoneIntensityFromSegmental(compositionFatSeg);
  const hasFatComposition = fatZoneIntensity != null;
  // Falls back to whichever of the two actually has data when the preferred
  // one doesn't — e.g. a reading with only a fat breakdown still shows it
  // by default instead of an empty card.
  const activeMetric: BodyMapMetric = zoneIntensity == null && hasFatComposition ? 'fat' : metric;
  const activeZoneIntensity = activeMetric === 'fat' ? fatZoneIntensity : zoneIntensity;
  const activeSeg = activeMetric === 'fat' ? compositionFatSeg : compositionSeg;
  const zoneLabels = activeSeg
    ? {
        leftArm: activeSeg.leftArm != null ? `${activeSeg.leftArm.toFixed(1)}kg` : undefined,
        rightArm: activeSeg.rightArm != null ? `${activeSeg.rightArm.toFixed(1)}kg` : undefined,
        trunk: activeSeg.trunk != null ? `${activeSeg.trunk.toFixed(1)}kg` : undefined,
        leftLeg: activeSeg.leftLeg != null ? `${activeSeg.leftLeg.toFixed(1)}kg` : undefined,
        rightLeg: activeSeg.rightLeg != null ? `${activeSeg.rightLeg.toFixed(1)}kg` : undefined,
      }
    : undefined;

  // Status follows whichever kg source is actually being shown — the report's
  // own live/loaded status when the live numbers are what's on screen, else
  // the same fallback entry's own status (so the two never mismatch).
  const statusSource = Object.values(liveSeg).some((v) => v != null) ? segmentalStatus : latestSavedSeg?.segmentalLeanMassStatus;
  const fatStatusSource = Object.values(liveFatSeg).some((v) => v != null) ? segmentalFatStatus : latestSavedFatSeg?.segmentalFatMassStatus;
  const zoneStatus = zoneStatusFromSegmental(statusSource);
  const fatZoneStatus = zoneStatusFromSegmental(fatStatusSource);
  const activeZoneStatus = activeMetric === 'fat' ? fatZoneStatus : zoneStatus;

  // Weight/BMI/fat/muscle for whatever's currently on screen — a fresh
  // draft, or a past reading loaded via the date picker — against the
  // closest saved entry strictly before it (not necessarily weights[1]. if
  // we're viewing history rather than the latest). A blank draft (opened
  // without a fresh scan) falls back to the latest saved entry, same as the
  // composition map already does above, instead of showing nothing.
  const currentWeightNum = num(kg);
  const currentTimestamp = isoFromDateInput(date);
  const currentEntry: WeightEntry | undefined = currentWeightNum
    ? { at: currentTimestamp, kg: currentWeightNum, bodyFatPercent: num(bodyFat), skeletalMuscleMassKg: num(muscleMass) }
    : weights[0];
  const previousEntry = currentWeightNum
    ? weights.find((w) => new Date(w.at).getTime() < new Date(currentTimestamp).getTime())
    : weights[1];
  const stats = currentEntry && profile ? bodyStatsFor(currentEntry, previousEntry, profile) : undefined;

  // Picking an existing date loads that day's saved reading into the whole
  // form — the date picker doubles as a way to browse history, not just tag
  // a new entry.
  const loadReading = (entry: WeightEntry) => {
    setKg(String(entry.kg));
    setBodyFat(entry.bodyFatPercent != null ? String(entry.bodyFatPercent) : '');
    setMuscleMass(entry.skeletalMuscleMassKg != null ? String(entry.skeletalMuscleMassKg) : '');
    const seg = entry.segmentalLeanMassKg;
    setSegmental({
      leftArm: seg?.leftArm != null ? String(seg.leftArm) : '',
      rightArm: seg?.rightArm != null ? String(seg.rightArm) : '',
      trunk: seg?.trunk != null ? String(seg.trunk) : '',
      leftLeg: seg?.leftLeg != null ? String(seg.leftLeg) : '',
      rightLeg: seg?.rightLeg != null ? String(seg.rightLeg) : '',
    });
    setShowSegmental(!!seg && Object.values(seg).some((v) => v != null));
    const fatSeg = entry.segmentalFatMassKg;
    setSegmentalFat({
      leftArm: fatSeg?.leftArm != null ? String(fatSeg.leftArm) : '',
      rightArm: fatSeg?.rightArm != null ? String(fatSeg.rightArm) : '',
      trunk: fatSeg?.trunk != null ? String(fatSeg.trunk) : '',
      leftLeg: fatSeg?.leftLeg != null ? String(fatSeg.leftLeg) : '',
      rightLeg: fatSeg?.rightLeg != null ? String(fatSeg.rightLeg) : '',
    });
    setShowSegmentalFat(!!fatSeg && Object.values(fatSeg).some((v) => v != null));
    setSegmentalStatus(entry.segmentalLeanMassStatus);
    setSegmentalFatStatus(entry.segmentalFatMassStatus);
    setDeviceLabel(entry.reportLabel);
    setSource(entry.source ?? 'manual');
    setLowConfidence(false);
    setPdfName(undefined);
  };

  // Fills the form from a freshly-analyzed report — used by the PDF upload
  // below (an in-place update, unlike the camera scan's route-param prefill
  // above, since there's no navigation involved).
  const applyAnalysis = (a: BodyReadingAnalysis) => {
    if (a.weightKg != null) setKg(String(a.weightKg));
    if (a.bodyFatPercent != null) setBodyFat(String(a.bodyFatPercent));
    if (a.skeletalMuscleMassKg != null) setMuscleMass(String(a.skeletalMuscleMassKg));
    const seg = a.segmentalLeanMassKg;
    if (seg && Object.values(seg).some((v) => v != null)) {
      setSegmental({
        leftArm: seg.leftArm != null ? String(seg.leftArm) : '',
        rightArm: seg.rightArm != null ? String(seg.rightArm) : '',
        trunk: seg.trunk != null ? String(seg.trunk) : '',
        leftLeg: seg.leftLeg != null ? String(seg.leftLeg) : '',
        rightLeg: seg.rightLeg != null ? String(seg.rightLeg) : '',
      });
      setShowSegmental(true);
    }
    const fatSeg = a.segmentalFatMassKg;
    if (fatSeg && Object.values(fatSeg).some((v) => v != null)) {
      setSegmentalFat({
        leftArm: fatSeg.leftArm != null ? String(fatSeg.leftArm) : '',
        rightArm: fatSeg.rightArm != null ? String(fatSeg.rightArm) : '',
        trunk: fatSeg.trunk != null ? String(fatSeg.trunk) : '',
        leftLeg: fatSeg.leftLeg != null ? String(fatSeg.leftLeg) : '',
        rightLeg: fatSeg.rightLeg != null ? String(fatSeg.rightLeg) : '',
      });
      setShowSegmentalFat(true);
    }
    setSegmentalStatus(a.segmentalLeanMassStatus);
    setSegmentalFatStatus(a.segmentalFatMassStatus);
    setDeviceLabel(a.deviceLabel);
    setSource('scan');
    setLowConfidence(a.confidence < 0.5);
    if (a.testDate) setDate(a.testDate);
  };

  const uploadPdf = async () => {
    if (uploadStage === 'picking' || uploadStage === 'analyzing') return;
    setUploadStage('picking');
    setUploadError(null);
    const picked = await pickReportBase64().catch(() => null);
    if (!picked) {
      setUploadStage('idle');
      return;
    }
    if (picked.kind === 'unsupported') {
      setUploadStage('error');
      setUploadError(t('bodyReading.unsupportedFile'));
      return;
    }
    setUploadStage('analyzing');
    try {
      const payload =
        picked.kind === 'pdf' ? { pdf: picked.base64 } : { image: picked.base64, imageMediaType: picked.mimeType };
      const analysis = await analyzeBodyReading(payload, language);
      useEntitlement.getState().spend();
      applyAnalysis(analysis);
      setPdfName(picked.name);
      setUploadStage('idle');
    } catch (err) {
      if (err instanceof QuotaError || err instanceof FeatureLockedError) {
        useEntitlement.getState().refresh();
        setUploadStage('idle');
        router.push(`/upgrade?reason=${err instanceof QuotaError ? 'quota' : 'coach'}`);
        return;
      }
      setUploadStage('error');
      setUploadError(
        err instanceof ApiError
          ? t(err.code === 'invalid_request' ? 'bodyReading.errorInvalidFile' : 'bodyReading.errorAnalysisFailed')
          : t('bodyReading.errorOffline'),
      );
    }
  };

  const confirmDeleteReading = (at: string) =>
    Alert.alert(t('bodyReading.deleteReadingConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteWeight(at) },
    ]);

  const save = () => {
    const weightKg = num(kg);
    if (!weightKg) return;
    const seg = {
      leftArm: num(segmental.leftArm),
      rightArm: num(segmental.rightArm),
      trunk: num(segmental.trunk),
      leftLeg: num(segmental.leftLeg),
      rightLeg: num(segmental.rightLeg),
    };
    const hasSeg = Object.values(seg).some((v) => v != null);
    const fatSeg = {
      leftArm: num(segmentalFat.leftArm),
      rightArm: num(segmentalFat.rightArm),
      trunk: num(segmentalFat.trunk),
      leftLeg: num(segmentalFat.leftLeg),
      rightLeg: num(segmentalFat.rightLeg),
    };
    const hasFatSeg = Object.values(fatSeg).some((v) => v != null);
    logBodyReading({
      kg: weightKg,
      at: isoFromDateInput(date),
      bodyFatPercent: num(bodyFat),
      skeletalMuscleMassKg: num(muscleMass),
      segmentalLeanMassKg: hasSeg ? seg : undefined,
      segmentalFatMassKg: hasFatSeg ? fatSeg : undefined,
      segmentalLeanMassStatus: hasSeg ? segmentalStatus : undefined,
      segmentalFatMassStatus: hasFatSeg ? segmentalFatStatus : undefined,
      source,
      reportLabel: deviceLabel,
    });
    clearPending();
    successHaptic();
    // A weight change big enough to matter gets a chance to update the
    // calorie goal before leaving — the same window Overview's quick
    // weigh-in shows, blocking the back-navigation until it's handled so it
    // isn't shown on a screen that's already gone.
    if (profile && targetsNeedUpdate(profile, weightKg)) {
      setPendingWeightKg(weightKg);
    } else {
      router.back();
    }
  };

  return (
    <Screen
      footer={
        <View>
          <Button label={t('bodyReading.save')} onPress={save} disabled={!num(kg)} />
          <Button
            label={source === 'scan' ? t('bodyReading.rescan') : t('bodyReading.scanReport')}
            variant="secondary"
            icon="camera-outline"
            onPress={() => router.push('/scan?mode=body')}
            style={{ marginTop: Spacing.xs }}
          />
          {documentPickerAvailable && (
            <>
              <Button
                label={t('bodyReading.uploadPdf')}
                variant="ghost"
                icon="document-attach-outline"
                loading={uploadStage === 'picking' || uploadStage === 'analyzing'}
                onPress={uploadPdf}
                style={{ marginTop: Spacing.xs }}
              />
              {uploadStage !== 'idle' && <UploadProgress stage={uploadStage} error={uploadError} />}
            </>
          )}
        </View>
      }
    >
      <View style={styles.header}>
        <Title>{t('bodyReading.title')}</Title>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Text style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
        {t('bodyReading.subtitle')}
      </Text>

      {source === 'scan' && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" />
          ) : pdfName ? (
            <View style={[styles.thumb, styles.pdfThumb, { backgroundColor: theme.cardSubtle }]}>
              <Ionicons name="document-text-outline" size={22} color={theme.textSecondary} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
              {deviceLabel ? t('bodyReading.deviceLabel', { device: deviceLabel }) : t('bodyReading.scannedBadge')}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
              {lowConfidence ? t('bodyReading.lowConfidence') : t('bodyReading.scannedBadge')}
            </Text>
          </View>
        </Card>
      )}

      <View>
        <Field
          label={t('bodyReading.date')}
          value={date}
          editable={false}
          placeholder="YYYY-MM-DD"
        />
        {/* A non-editable TextInput can still swallow the tap itself on some
            platforms rather than letting it bubble to a wrapping Pressable —
            an overlay guarantees the tap is actually caught. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(true)} />
      </View>
      <DatePickerModal
        visible={showDatePicker}
        value={new Date(isoFromDateInput(date))}
        maxDate={new Date()}
        onChange={(d) => {
          const newDate = ymd(d);
          setDate(newDate);
          const existing = weights.find((w) => ymd(new Date(w.at)) === newDate);
          if (existing) loadReading(existing);
        }}
        onClose={() => setShowDatePicker(false)}
      />

      {(zoneIntensity || fatZoneIntensity) && (
        <View style={[styles.trendCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.sm, textAlign: 'center' }]}>
            {activeMetric === 'fat' ? t('bodyReading.compositionFat') : t('bodyReading.composition')}
          </Text>
          {stats && (stats.bodyFatPercent != null || stats.musclePercent != null) && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl, marginBottom: Spacing.sm }}>
              {stats.bodyFatPercent != null && (
                <CompositionStat
                  label={t('bodyReading.bodyFat')}
                  value={`${stats.bodyFatPercent}%`}
                  delta={stats.bodyFatDelta}
                  trend={stats.bodyFatTrend}
                  theme={theme}
                />
              )}
              {stats.musclePercent != null && (
                <CompositionStat
                  label={t('progress.musclePercent')}
                  value={`${stats.musclePercent.toFixed(0)}%`}
                  delta={stats.muscleDelta}
                  trend={stats.muscleTrend}
                  theme={theme}
                />
              )}
            </View>
          )}
          <View style={{ alignItems: 'center' }}>
            <BodyMap
              view={mapView}
              zoneIntensity={activeZoneIntensity ?? undefined}
              zoneStatus={activeZoneStatus ?? undefined}
              zoneColor={activeMetric === 'fat' ? theme.fat : theme.primary}
              zoneLabels={zoneLabels}
              size={150}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: Spacing.lg,
              marginTop: Spacing.sm,
            }}
          >
            {zoneIntensity && fatZoneIntensity && (
              <BodyMapMetricSwitch metric={activeMetric} onChange={setMetric} />
            )}
            <BodyMapViewSwitch view={mapView} onChange={setMapView} />
          </View>
          <View style={{ marginTop: Spacing.sm }}>
            {activeZoneStatus ? <BodyMapStatusLegend /> : <BodyMapIntensityHint />}
          </View>
        </View>
      )}

      {weightSeries.length >= 2 && (
        <View style={[styles.trendCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.xs }]}>
            {t('bodyReading.trend')}
          </Text>
          <TrendLine values={weightSeries} labels={weightLabels} color={trendColor(weightLineTrend)} width={width - Spacing.md * 4} />
        </View>
      )}

      {bmiSeries.length >= 2 && (
        <View style={[styles.trendCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.xs }]}>
            {t('progress.bmi')}
          </Text>
          <TrendLine values={bmiSeries} labels={weightLabels} color={trendColor(bmiLineTrend)} width={width - Spacing.md * 4} />
        </View>
      )}

      {bodyFatSeries.length >= 2 && (
        <View style={[styles.trendCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.xs }]}>
            {t('bodyReading.bodyFat')}
          </Text>
          <TrendLine values={bodyFatSeries} labels={bodyFatLabels} color={trendColor(bodyFatLineTrend)} width={width - Spacing.md * 4} />
        </View>
      )}

      {muscleSeries.length >= 2 && (
        <View style={[styles.trendCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.xs }]}>
            {t('progress.musclePercent')}
          </Text>
          <TrendLine values={muscleSeries} labels={muscleLabels} color={trendColor(muscleLineTrend)} width={width - Spacing.md * 4} />
        </View>
      )}

      {weights.length > 0 && (
        <Button
          label={t('bodyReading.askCoach')}
          variant="ghost"
          icon="sparkles-outline"
          onPress={askCoach}
          style={{ marginBottom: Spacing.md }}
        />
      )}

      <Field
        label={t('bodyReading.weight')}
        value={kg}
        onChangeText={(v) => setKg(normalizeDigits(v))}
        keyboardType="decimal-pad"
        maxLength={5}
        suffix={t('progress.kg')}
      />
      <Field
        label={t('bodyReading.bodyFat')}
        value={bodyFat}
        onChangeText={(v) => setBodyFat(normalizeDigits(v))}
        keyboardType="decimal-pad"
        maxLength={4}
        suffix="%"
      />
      <Field
        label={t('bodyReading.muscleMass')}
        value={muscleMass}
        onChangeText={(v) => setMuscleMass(normalizeDigits(v))}
        keyboardType="decimal-pad"
        maxLength={5}
        suffix={t('progress.kg')}
      />

      <Pressable onPress={() => setShowSegmental((v) => !v)} style={styles.segmentalToggle}>
        <Ionicons name={showSegmental ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textSecondary} />
        <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
          {t('bodyReading.segmental')}
        </Text>
      </Pressable>
      {showSegmental && (
        <View>
          {(['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'] as const).map((key) => (
            <Field
              key={key}
              label={t(`bodyReading.${key}`)}
              value={segmental[key]}
              onChangeText={(v) => setSegmental((s) => ({ ...s, [key]: normalizeDigits(v) }))}
              keyboardType="decimal-pad"
              maxLength={5}
              suffix={t('progress.kg')}
            />
          ))}
        </View>
      )}

      <Pressable onPress={() => setShowSegmentalFat((v) => !v)} style={styles.segmentalToggle}>
        <Ionicons name={showSegmentalFat ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textSecondary} />
        <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
          {t('bodyReading.segmentalFat')}
        </Text>
      </Pressable>
      {showSegmentalFat && (
        <View>
          {(['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'] as const).map((key) => (
            <Field
              key={key}
              label={t(`bodyReading.${key}`)}
              value={segmentalFat[key]}
              onChangeText={(v) => setSegmentalFat((s) => ({ ...s, [key]: normalizeDigits(v) }))}
              keyboardType="decimal-pad"
              maxLength={5}
              suffix={t('progress.kg')}
            />
          ))}
        </View>
      )}

      {recent.length > 0 && (
        <>
          <Text style={[Type.caption, { color: theme.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.sm }]}>
            {t('bodyReading.recent')}
          </Text>
          <View style={[styles.historyCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
            {recent.map((w, i) => (
              <View
                key={w.at}
                style={[
                  styles.historyRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                ]}
              >
                <Text style={{ color: theme.text, fontWeight: '600', flex: 1 }}>
                  {new Date(w.at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </Text>
                <Text style={{ color: theme.text }}>
                  {w.kg} {t('progress.kg')}
                </Text>
                {w.bodyFatPercent != null && (
                  <Text style={{ color: theme.textSecondary, marginStart: Spacing.sm }}>
                    {w.bodyFatPercent}%
                  </Text>
                )}
                <Pressable
                  onPress={() => confirmDeleteReading(w.at)}
                  hitSlop={10}
                  style={{ marginStart: Spacing.sm }}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.textTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      {profile && (
        <TargetUpdateModal
          visible={pendingWeightKg != null}
          profile={profile}
          newWeightKg={pendingWeightKg ?? profile.weightKg}
          onUpdate={() => {
            const w = pendingWeightKg;
            setPendingWeightKg(null);
            router.push(`/edit-profile?weightKg=${w}`);
          }}
          onDismiss={() => {
            setPendingWeightKg(null);
            router.back();
          }}
        />
      )}
    </Screen>
  );
}

/** Horizontal step row shown while an uploaded report is being read and
 * analyzed, so the wait isn't just a spinner — and on failure, the actual
 * reason instead of a generic alert. */
function UploadProgress({
  stage,
  error,
}: {
  stage: 'picking' | 'analyzing' | 'error';
  error: string | null;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [trackWidth, setTrackWidth] = useState(0);
  const [anim] = useState(() => new Animated.Value(0));

  // An indeterminate bar (a segment sliding end-to-end, looping) rather than
  // a determinate one — there's no real percentage to report for "reading a
  // file" or "waiting on the AI", so a moving bar is what actually reads as
  // "still working" instead of stalled, the way static highlighted dots didn't.
  useEffect(() => {
    if (stage === 'error') return;
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1100, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [stage, anim]);

  if (stage === 'error') {
    return (
      <View
        style={[
          styles.uploadProgress,
          { backgroundColor: theme.cardSubtle, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        ]}
      >
        <Ionicons name="alert-circle" size={16} color={theme.danger} />
        <Text style={{ color: theme.danger, fontSize: 12, flex: 1 }}>{error}</Text>
      </View>
    );
  }

  const segmentWidth = Math.max(48, trackWidth * 0.4);
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-segmentWidth, trackWidth],
  });

  return (
    <View style={[styles.uploadProgress, { backgroundColor: theme.cardSubtle }]}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 8 }}>
        {stage === 'picking' ? t('bodyReading.stepReading') : t('bodyReading.stepAnalyzing')}
      </Text>
      <View
        style={[styles.uploadTrack, { backgroundColor: theme.border }]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {trackWidth > 0 && (
          <Animated.View
            style={[
              styles.uploadBar,
              { width: segmentWidth, backgroundColor: theme.primary, transform: [{ translateX }] },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumb: { width: 44, height: 44, borderRadius: Radius.sm },
  pdfThumb: { alignItems: 'center', justifyContent: 'center' },
  trendCard: { borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  segmentalToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  historyCard: { borderRadius: Radius.md, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  uploadProgress: {
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  uploadTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  uploadBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
});
