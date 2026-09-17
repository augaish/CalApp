import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { DatePickerModal } from '@/components/date-picker';
import { ProgressBar } from '@/components/progress-bar';
import { IconTile, InfoLine, Segmented } from '@/components/system';
import { TargetUpdateModal } from '@/components/target-update-modal';
import { Button, Field, Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { displayToKg, formatWeight, kgToDisplay, weightUnit } from '@/lib/units';
import { analyzeBodyReading, ApiError, FeatureLockedError, QuotaError } from '@/lib/api';
import { documentPickerAvailable, pickReportBase64 } from '@/lib/document-picker';
import { useEntitlement } from '@/lib/entitlement';
import { successHaptic } from '@/lib/feedback';
import { normalizeDigits } from '@/lib/numbers';
import { usePending } from '@/lib/pending';
import { targetsNeedUpdate } from '@/lib/tdee';
import { useAppStore } from '@/lib/store';
import type { BodyMeasurements, BodyReadingAnalysis, SegmentalStatus, WeightEntry } from '@/lib/types';

type DimensionKey = keyof BodyMeasurements;
const DIMENSION_KEYS: DimensionKey[] = ['waist', 'chest', 'hips', 'neck', 'leftArm', 'rightArm', 'leftThigh', 'rightThigh'];
const MORE_DIMENSIONS = DIMENSION_KEYS.filter((k) => k !== 'waist');
const EMPTY_DIMENSIONS: Record<DimensionKey, string> = {
  waist: '',
  chest: '',
  hips: '',
  neck: '',
  leftArm: '',
  rightArm: '',
  leftThigh: '',
  rightThigh: '',
};
type SegKey = 'leftArm' | 'rightArm' | 'trunk' | 'leftLeg' | 'rightLeg';
const SEG_KEYS: SegKey[] = ['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'];

/** A YYYY-MM-DD string, local time, so "today" means today regardless of UTC offset. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** How many days back a saved-at timestamp is from right now. Module-level
 * because it reads the clock, which the React Compiler's purity check only
 * allows outside the component body. */
function daysSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
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

const segToText = (seg?: Partial<Record<SegKey, number | undefined>>): Record<SegKey, string> =>
  Object.fromEntries(SEG_KEYS.map((k) => [k, seg?.[k] != null ? String(seg[k]) : ''])) as Record<SegKey, string>;
const hasAny = (o: Record<string, string>) => Object.values(o).some((v) => v.trim() !== '');

/**
 * S04 Add/edit reading — the one place a body measurement is written.
 *
 * Only the date and at least one metric are required; blank optional fields
 * stay null, never zero. A photo or PDF fills these same editable fields for
 * a human check rather than saving on its own. Saving a date that already
 * has a reading revises that reading in place: `at` keeps the measured date,
 * so an older reading edited today never becomes "the latest" (AT24).
 */
export default function BodyReading() {
  const { fromScan, date: dateParam } = useLocalSearchParams<{ fromScan?: string; date?: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

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
  // here; a `date` param opens an existing reading for revision. Both are
  // consumed by the form's initial state — route params never change after
  // mount, so lazy initializers cover them without an effect.
  const scanned = fromScan === '1' ? bodyReading : null;
  const existingForParam = dateParam ? weights.find((w) => ymd(new Date(w.at)) === dateParam) : undefined;
  const initial = existingForParam;

  const [mode, setMode] = useState<'manual' | 'photo'>(scanned ? 'photo' : 'manual');
  const units = useAppStore((s) => s.units);
  const show = (v: number) => String(Number(kgToDisplay(v, units).toFixed(1)));
  // The field holds the display unit; `weightValue` below is always kg.
  const [kg, setKg] = useState(scanned?.weightKg != null ? show(scanned.weightKg) : initial ? show(initial.kg) : '');
  const [bodyFat, setBodyFat] = useState(
    scanned?.bodyFatPercent != null ? String(scanned.bodyFatPercent) : initial?.bodyFatPercent != null ? String(initial.bodyFatPercent) : '',
  );
  const [muscleMass, setMuscleMass] = useState(
    scanned?.skeletalMuscleMassKg != null
      ? String(scanned.skeletalMuscleMassKg)
      : initial?.skeletalMuscleMassKg != null
        ? String(initial.skeletalMuscleMassKg)
        : '',
  );
  const [segmental, setSegmental] = useState<Record<SegKey, string>>(() => segToText(scanned?.segmentalLeanMassKg ?? initial?.segmentalLeanMassKg));
  const [segmentalFat, setSegmentalFat] = useState<Record<SegKey, string>>(() => segToText(scanned?.segmentalFatMassKg ?? initial?.segmentalFatMassKg));
  const [dimensions, setDimensions] = useState<Record<DimensionKey, string>>(() => ({
    ...EMPTY_DIMENSIONS,
    ...Object.fromEntries(DIMENSION_KEYS.map((k) => [k, initial?.measurementsCm?.[k] != null ? String(initial.measurementsCm[k]) : ''])),
  }));
  const [showMore, setShowMore] = useState(
    () => hasAny(segToText(scanned?.segmentalLeanMassKg ?? initial?.segmentalLeanMassKg)) || !!initial?.skeletalMuscleMassKg || !!scanned?.skeletalMuscleMassKg,
  );
  const [showSegmental, setShowSegmental] = useState(() => hasAny(segToText(scanned?.segmentalLeanMassKg ?? initial?.segmentalLeanMassKg)));
  const [showSegmentalFat, setShowSegmentalFat] = useState(() => hasAny(segToText(scanned?.segmentalFatMassKg ?? initial?.segmentalFatMassKg)));
  const [showNotes, setShowNotes] = useState(!!initial?.note);
  const [note, setNote] = useState(initial?.note ?? '');
  // Purely descriptive — never user-edited, since we have no reference
  // range to recompute it from ourselves. Only ever set from a report's own
  // printed classification (a fresh scan, or a past saved reading).
  const [segmentalStatus, setSegmentalStatus] = useState<SegmentalStatus | undefined>(scanned?.segmentalLeanMassStatus ?? initial?.segmentalLeanMassStatus);
  const [segmentalFatStatus, setSegmentalFatStatus] = useState<SegmentalStatus | undefined>(scanned?.segmentalFatMassStatus ?? initial?.segmentalFatMassStatus);
  const [deviceLabel, setDeviceLabel] = useState(scanned?.deviceLabel ?? initial?.reportLabel);
  const [source, setSource] = useState<'manual' | 'scan'>(scanned ? 'scan' : (initial?.source ?? 'manual'));
  const [lowConfidence, setLowConfidence] = useState(scanned != null && scanned.confidence < 0.5);
  // Defaults to today; a fresh scan can override it with the date actually
  // printed on the report, and it stays freely editable either way.
  const [date, setDate] = useState(scanned?.testDate ?? dateParam ?? ymd(new Date()));
  const [pdfName, setPdfName] = useState<string | undefined>(undefined);
  const [uploadStage, setUploadStage] = useState<'idle' | 'picking' | 'analyzing' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dirty, setDirty] = useState(false);
  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setDirty(true);
    setter(v);
  };

  const num = (v: string) => {
    const n = Number(normalizeDigits(v));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // Picking a date that already has a reading loads it — the date picker
  // doubles as the way to revise history, not just tag a new entry.
  const loadReading = (entry: WeightEntry) => {
    setKg(show(entry.kg));
    setBodyFat(entry.bodyFatPercent != null ? String(entry.bodyFatPercent) : '');
    setMuscleMass(entry.skeletalMuscleMassKg != null ? String(entry.skeletalMuscleMassKg) : '');
    setSegmental(segToText(entry.segmentalLeanMassKg));
    setShowSegmental(hasAny(segToText(entry.segmentalLeanMassKg)));
    setSegmentalFat(segToText(entry.segmentalFatMassKg));
    setShowSegmentalFat(hasAny(segToText(entry.segmentalFatMassKg)));
    setSegmentalStatus(entry.segmentalLeanMassStatus);
    setSegmentalFatStatus(entry.segmentalFatMassStatus);
    const dim = entry.measurementsCm;
    setDimensions({ ...EMPTY_DIMENSIONS, ...Object.fromEntries(DIMENSION_KEYS.map((k) => [k, dim?.[k] != null ? String(dim[k]) : ''])) });
    setShowMore(entry.skeletalMuscleMassKg != null || hasAny(segToText(entry.segmentalLeanMassKg)) || MORE_DIMENSIONS.some((k) => dim?.[k] != null));
    setNote(entry.note ?? '');
    setShowNotes(!!entry.note);
    setDeviceLabel(entry.reportLabel);
    setSource(entry.source ?? 'manual');
    setLowConfidence(false);
    setPdfName(undefined);
  };

  // Fills the form from a freshly-analyzed report (PDF upload) — an in-place
  // update, unlike the camera scan's route-param prefill above.
  const applyAnalysis = (a: BodyReadingAnalysis) => {
    if (a.weightKg != null) setKg(String(a.weightKg));
    if (a.bodyFatPercent != null) setBodyFat(String(a.bodyFatPercent));
    if (a.skeletalMuscleMassKg != null) {
      setMuscleMass(String(a.skeletalMuscleMassKg));
      setShowMore(true);
    }
    if (a.segmentalLeanMassKg && Object.values(a.segmentalLeanMassKg).some((v) => v != null)) {
      setSegmental(segToText(a.segmentalLeanMassKg));
      setShowSegmental(true);
      setShowMore(true);
    }
    if (a.segmentalFatMassKg && Object.values(a.segmentalFatMassKg).some((v) => v != null)) {
      setSegmentalFat(segToText(a.segmentalFatMassKg));
      setShowSegmentalFat(true);
      setShowMore(true);
    }
    setSegmentalStatus(a.segmentalLeanMassStatus);
    setSegmentalFatStatus(a.segmentalFatMassStatus);
    setDeviceLabel(a.deviceLabel);
    setSource('scan');
    setLowConfidence(a.confidence < 0.5);
    if (a.testDate) setDate(a.testDate);
    setDirty(true);
  };

  const uploadPdf = async () => {
    if (uploadStage === 'picking' || uploadStage === 'analyzing' || uploadStage === 'done') return;
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
      const payload = picked.kind === 'pdf' ? { pdf: picked.base64 } : { image: picked.base64, imageMediaType: picked.mimeType };
      const analysis = await analyzeBodyReading(payload, language);
      useEntitlement.getState().spend();
      // Let the bar be seen completing before the fields fill in.
      setUploadStage('done');
      await new Promise((resolve) => setTimeout(resolve, 420));
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
          ? t(
              err.code === 'invalid_request'
                ? 'bodyReading.errorInvalidFile'
                : err.code === 'ai_credits_exhausted'
                  ? 'common.aiCreditsExhausted'
                  : err.code === 'no_reading_detected'
                    ? 'bodyReading.errorNoReading'
                    : 'bodyReading.errorAnalysisFailed',
            )
          : t('bodyReading.errorOffline'),
      );
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/health'));

  /** Cancel with unsaved edits offers Keep editing / Discard (S04). */
  const cancel = () => {
    if (!dirty) return leave();
    Alert.alert(t('bodyReading.discardTitle'), t('bodyReading.discardBody'), [
      { text: t('bodyReading.keepEditing'), style: 'cancel' },
      { text: t('bodyReading.discard'), style: 'destructive', onPress: leave },
    ]);
  };

  const weightValue = num(kg) != null ? Number(displayToKg(num(kg)!, units).toFixed(2)) : undefined;
  const bodyFatValue = num(bodyFat);
  const anyMetric = !!weightValue || !!bodyFatValue || !!num(muscleMass) || hasAny(dimensions) || hasAny(segmental) || hasAny(segmentalFat);

  const save = () => {
    if (!anyMetric) return;
    // Unusual but finite values get a review prompt from product limits, not
    // a diagnosis: nothing here decides what a body should weigh.
    const unusual =
      weightValue && (weightValue < 25 || weightValue > 350)
        ? { value: formatWeight(weightValue, units, t), field: t('bodyReading.weight') }
        : bodyFatValue && (bodyFatValue < 2 || bodyFatValue > 70)
          ? { value: `${bodyFatValue}%`, field: t('bodyReading.bodyFat') }
          : null;
    if (unusual) {
      Alert.alert(t('bodyReading.unusualTitle'), t('bodyReading.unusualBody', unusual), [
        { text: t('bodyReading.keepEditing'), style: 'cancel' },
        { text: t('bodyReading.saveAnyway'), onPress: () => saveDated() },
      ]);
      return;
    }
    saveDated();
  };

  const saveDated = () => {
    // A scanned report fills the date from the sheet, which is often not
    // today. Filing under an old date is right for a genuine import, but it
    // files the reading behind newer ones — ask rather than guess.
    const daysOld = daysSince(isoFromDateInput(date));
    if (daysOld > 7 && !existingForParam) {
      const printed = new Date(isoFromDateInput(date)).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
      Alert.alert(t('bodyReading.oldDateTitle'), t('bodyReading.oldDateBody', { date: printed }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('bodyReading.oldDateUseToday'), onPress: () => commitSave(ymd(new Date())) },
        { text: t('bodyReading.oldDateUseReport', { date: printed }), onPress: () => commitSave(date) },
      ]);
      return;
    }
    commitSave(date);
  };

  /** Files the reading (or revises the one on that date) and makes sure the user can see that it happened. */
  const commitSave = (onDate: string) => {
    const existing = weights.find((w) => ymd(new Date(w.at)) === onDate);
    // Revision keeps the measured timestamp; only the content changes.
    const at = existing ? existing.at : isoFromDateInput(onDate);
    const seg = Object.fromEntries(SEG_KEYS.map((k) => [k, num(segmental[k])])) as Record<SegKey, number | undefined>;
    const fatSeg = Object.fromEntries(SEG_KEYS.map((k) => [k, num(segmentalFat[k])])) as Record<SegKey, number | undefined>;
    const hasSeg = Object.values(seg).some((v) => v != null);
    const hasFatSeg = Object.values(fatSeg).some((v) => v != null);
    const dim = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, num(dimensions[k])])) as BodyMeasurements;
    const hasDim = Object.values(dim).some((v) => v != null);
    // Weight is the one field the trend needs; a measurement-only reading
    // keeps the previous weight on that date rather than inventing one.
    const kgToSave = weightValue ?? existing?.kg ?? weights.find((w) => new Date(w.at).getTime() <= new Date(at).getTime())?.kg;
    if (!kgToSave) {
      Alert.alert(t('bodyReading.unusualTitle'), t('bodyReading.weightNeededFirst'));
      return;
    }
    if (existing) deleteWeight(existing.at);
    logBodyReading({
      kg: kgToSave,
      at,
      bodyFatPercent: bodyFatValue,
      skeletalMuscleMassKg: num(muscleMass),
      measurementsCm: hasDim ? dim : undefined,
      segmentalLeanMassKg: hasSeg ? seg : undefined,
      segmentalFatMassKg: hasFatSeg ? fatSeg : undefined,
      segmentalLeanMassStatus: hasSeg ? segmentalStatus : undefined,
      segmentalFatMassStatus: hasFatSeg ? segmentalFatStatus : undefined,
      source,
      reportLabel: deviceLabel,
      note: note.trim() || undefined,
      editedAt: existing ? new Date().toISOString() : undefined,
    });
    clearPending();
    successHaptic();
    setDirty(false);
    const savedOld = daysSince(at) > 7;
    if (savedOld && !existing) {
      // Filed in the past it sits behind newer readings, so say plainly what was filed and when.
      Alert.alert(
        t('bodyReading.savedTitle'),
        t('bodyReading.savedOldBody', { date: new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) }),
        [{ text: t('common.done'), onPress: leave }],
      );
      return;
    }
    // A weight change big enough to matter gets a chance to update the
    // calorie goal before leaving — never silently.
    if (profile && weightValue && targetsNeedUpdate(profile, weightValue) && weights[0]?.at === at) {
      setPendingWeightKg(weightValue);
    } else {
      leave();
    }
  };

  const dateLabel = new Date(isoFromDateInput(date)).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Screen
      header={<PageHeader title={existingForParam ? t('bodyReading.editTitle') : t('health.addReading')} onBack={cancel} />}
      footer={
        <View style={{ gap: Spacing.xs }}>
          <Button label={t('bodyReading.save')} onPress={save} disabled={!anyMetric} />
          <Button label={t('common.cancel')} variant="ghost" onPress={cancel} />
        </View>
      }
    >
      <Segmented
        options={[
          { key: 'manual', label: t('bodyReading.enterManually') },
          { key: 'photo', label: t('bodyReading.readFromPhoto') },
        ]}
        value={mode}
        onChange={setMode}
        style={{ marginBottom: Spacing.md }}
      />

      {mode === 'photo' && (
        <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          {source === 'scan' ? (
            <View style={styles.scanBadge}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" />
              ) : (
                <IconTile icon={pdfName ? 'document-text-outline' : 'camera-outline'} size={44} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
                  {deviceLabel ? t('bodyReading.deviceLabel', { device: deviceLabel }) : t('bodyReading.scannedBadge')}
                </Text>
                <Text style={{ color: lowConfidence ? theme.warningText : theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {lowConfidence ? t('bodyReading.lowConfidence') : t('bodyReading.scannedBadge')}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: Spacing.sm }}>{t('bodyReading.photoIntro')}</Text>
          )}
          <Button
            label={source === 'scan' ? t('bodyReading.rescan') : t('bodyReading.photographReport')}
            variant="secondary"
            icon="camera-outline"
            onPress={() => router.push('/scan?mode=body')}
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
      )}

      <View style={[styles.card, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
        <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>{t('bodyReading.date')}</Text>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('bodyReading.date')}: ${dateLabel}`}
          style={({ pressed }) => [styles.dateRow, { backgroundColor: theme.surfaceTint }, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="calendar-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 16, flex: 1 }}>{dateLabel}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Pressable>
        <DatePickerModal
          visible={showDatePicker}
          value={new Date(isoFromDateInput(date))}
          maxDate={new Date()}
          onChange={(d) => {
            const newDate = ymd(d);
            setDate(newDate);
            setDirty(true);
            const existing = weights.find((w) => ymd(new Date(w.at)) === newDate);
            if (existing) loadReading(existing);
          }}
          onClose={() => setShowDatePicker(false)}
        />

        <View style={{ height: Spacing.md }} />
        <Field label={t('bodyReading.weight')} value={kg} onChangeText={touch((v: string) => setKg(normalizeDigits(v)))} keyboardType="decimal-pad" maxLength={5} suffix={weightUnit(units, t)} />
        <Field
          label={`${t('bodyReading.waist')} ${t('bodyReading.optional')}`}
          value={dimensions.waist}
          onChangeText={touch((v: string) => setDimensions((s) => ({ ...s, waist: normalizeDigits(v) })))}
          keyboardType="decimal-pad"
          maxLength={5}
          suffix="cm"
        />
        <Field
          label={`${t('bodyReading.bodyFat')} ${t('bodyReading.optional')}`}
          value={bodyFat}
          onChangeText={touch((v: string) => setBodyFat(normalizeDigits(v)))}
          keyboardType="decimal-pad"
          maxLength={4}
          suffix="%"
        />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>{t('bodyReading.source')}</Text>
        <View style={[styles.sourceRow, { backgroundColor: theme.surfaceTint }]}>
          <Ionicons name={source === 'scan' ? 'scan-outline' : 'pencil-outline'} size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
            {source === 'scan' ? (deviceLabel ? t('health.sourceScanNamed', { device: deviceLabel }) : t('health.sourceScan')) : t('health.sourceManual')}
          </Text>
        </View>
        <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: 6 }}>{t('bodyReading.onlyEntered')}</Text>
      </View>

      {/* Notes */}
      <Pressable
        onPress={() => setShowNotes((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showNotes }}
        style={({ pressed }) => [styles.toggleCard, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
      >
        <IconTile icon="document-text-outline" />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{t('bodyReading.notes')}</Text>
        <Ionicons name={showNotes ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
      </Pressable>
      {showNotes && (
        <View style={[styles.card, { backgroundColor: theme.card, marginTop: -Spacing.sm }, cardShadow(theme.shadow)]}>
          <TextInput
            value={note}
            onChangeText={touch(setNote)}
            placeholder={t('bodyReading.notesPlaceholder')}
            placeholderTextColor={theme.textTertiary}
            multiline
            style={[styles.notes, { color: theme.text, borderColor: theme.border }]}
            accessibilityLabel={t('bodyReading.notes')}
          />
        </View>
      )}

      {/* More measurements: composition, segmental breakdowns, other tape measures. */}
      <Pressable
        onPress={() => setShowMore((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showMore }}
        style={({ pressed }) => [styles.toggleCard, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }]}
      >
        <IconTile icon={showMore ? 'remove' : 'add'} />
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{showMore ? t('bodyReading.fewer') : t('bodyReading.addMore')}</Text>
        <Ionicons name={showMore ? 'chevron-up' : 'chevron-forward'} size={18} color={theme.textTertiary} />
      </Pressable>
      {showMore && (
        <View style={[styles.card, { backgroundColor: theme.card, marginTop: -Spacing.sm }, cardShadow(theme.shadow)]}>
          <Field
            label={`${t('bodyReading.muscleMass')} ${t('bodyReading.optional')}`}
            value={muscleMass}
            onChangeText={touch((v: string) => setMuscleMass(normalizeDigits(v)))}
            keyboardType="decimal-pad"
            maxLength={5}
            suffix={t('progress.kg')}
          />
          {MORE_DIMENSIONS.map((key) => (
            <Field
              key={key}
              label={`${t(`bodyReading.${key}`)} ${t('bodyReading.optional')}`}
              value={dimensions[key]}
              onChangeText={touch((v: string) => setDimensions((s) => ({ ...s, [key]: normalizeDigits(v) })))}
              keyboardType="decimal-pad"
              maxLength={5}
              suffix="cm"
            />
          ))}
          <Pressable onPress={() => setShowSegmental((v) => !v)} style={styles.subToggle} accessibilityRole="button" accessibilityState={{ expanded: showSegmental }}>
            <Ionicons name={showSegmental ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 13 }}>{t('bodyReading.segmental')}</Text>
          </Pressable>
          {showSegmental &&
            SEG_KEYS.map((key) => (
              <Field
                key={key}
                label={t(`bodyReading.${key}`)}
                value={segmental[key]}
                onChangeText={touch((v: string) => setSegmental((s) => ({ ...s, [key]: normalizeDigits(v) })))}
                keyboardType="decimal-pad"
                maxLength={5}
                suffix={t('progress.kg')}
              />
            ))}
          <Pressable onPress={() => setShowSegmentalFat((v) => !v)} style={styles.subToggle} accessibilityRole="button" accessibilityState={{ expanded: showSegmentalFat }}>
            <Ionicons name={showSegmentalFat ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 13 }}>{t('bodyReading.segmentalFat')}</Text>
          </Pressable>
          {showSegmentalFat &&
            SEG_KEYS.map((key) => (
              <Field
                key={key}
                label={t(`bodyReading.${key}`)}
                value={segmentalFat[key]}
                onChangeText={touch((v: string) => setSegmentalFat((s) => ({ ...s, [key]: normalizeDigits(v) })))}
                keyboardType="decimal-pad"
                maxLength={5}
                suffix={t('progress.kg')}
              />
            ))}
        </View>
      )}

      <InfoLine>{t('bodyReading.revisionNote')}</InfoLine>

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
            leave();
          }}
        />
      )}
    </Screen>
  );
}

/** Progress while an uploaded report is read and analysed — and on failure,
 * the actual reason instead of a generic alert. */
function UploadProgress({ stage, error }: { stage: 'picking' | 'analyzing' | 'done' | 'error'; error: string | null }) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (stage === 'error') {
    return (
      <View style={[styles.uploadProgress, { backgroundColor: theme.surfaceTint, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]}>
        <Ionicons name="alert-circle" size={16} color={theme.errorText} />
        <Text style={{ color: theme.errorText, fontSize: 12, flex: 1 }}>{error}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.uploadProgress, { backgroundColor: theme.surfaceTint }]}>
      <ProgressBar
        done={stage === 'done'}
        label={stage === 'done' ? t('bodyReading.stepDone') : stage === 'picking' ? t('bodyReading.stepReading') : t('bodyReading.stepAnalyzing')}
        trackColor={theme.border}
        fillColor={theme.primary}
        textColor={theme.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.module, padding: Spacing.md, marginBottom: Spacing.md },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.module, padding: Spacing.ms, marginBottom: Spacing.md, minHeight: 56 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.control, paddingHorizontal: Spacing.md, minHeight: 48 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.control, paddingHorizontal: Spacing.md, minHeight: 44 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: Spacing.md },
  scanBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  thumb: { width: 44, height: 44, borderRadius: Radius.sm },
  notes: { borderWidth: 1, borderRadius: Radius.control, padding: Spacing.ms, minHeight: 80, fontSize: 15, textAlignVertical: 'top' },
  subToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm, minHeight: 40 },
  uploadProgress: { borderRadius: Radius.control, padding: Spacing.sm, marginTop: Spacing.xs },
});
