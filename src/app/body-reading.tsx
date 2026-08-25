import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { BodyMap, BodyMapViewSwitch, zoneIntensityFromSegmental, type BodyMapView } from '@/components/body-map';
import { TrendLine } from '@/components/charts';
import { Button, Card, Field, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { normalizeDigits } from '@/lib/numbers';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

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

  const weights = useAppStore((s) => s.weights);
  const logBodyReading = useAppStore((s) => s.logBodyReading);
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
  const [mapView, setMapView] = useState<BodyMapView>('front');
  const deviceLabel = scanned?.deviceLabel;
  const source: 'manual' | 'scan' = scanned ? 'scan' : 'manual';
  const lowConfidence = scanned != null && scanned.confidence < 0.5;

  const recent = useMemo(() => weights.slice(0, 6), [weights]);
  const trendSeries = useMemo(() => [...weights].slice(0, 8).reverse(), [weights]);
  const weightSeries = trendSeries.map((w) => w.kg);
  const weightLabels = trendSeries.map((w) =>
    new Date(w.at).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }),
  );

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
    logBodyReading({
      kg: weightKg,
      bodyFatPercent: num(bodyFat),
      skeletalMuscleMassKg: num(muscleMass),
      segmentalLeanMassKg: hasSeg ? seg : undefined,
      source,
      reportLabel: deviceLabel,
    });
    clearPending();
    successHaptic();
    router.back();
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
          {photoUri && (
            <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" />
          )}
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

      {zoneIntensity && (
        <View style={[styles.trendCard, { backgroundColor: theme.card, alignItems: 'center' }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.xs, alignSelf: 'flex-start' }]}>
            {t('bodyReading.composition')}
          </Text>
          <BodyMap view={mapView} zoneIntensity={zoneIntensity} size={130} />
          <View style={{ marginTop: Spacing.xs }}>
            <BodyMapViewSwitch view={mapView} onChange={setMapView} />
          </View>
        </View>
      )}

      {weightSeries.length >= 2 && (
        <View style={[styles.trendCard, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
          <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: Spacing.xs }]}>
            {t('bodyReading.trend')}
          </Text>
          <TrendLine values={weightSeries} labels={weightLabels} color={theme.primary} width={width - Spacing.md * 4} />
        </View>
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
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumb: { width: 44, height: 44, borderRadius: Radius.sm },
  trendCard: { borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  segmentalToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  historyCard: { borderRadius: Radius.md, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
});
