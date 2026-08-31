import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoProgress } from '@/components/photo-progress';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  analyzeBodyReading,
  analyzeEquipment,
  analyzeMeal,
  ApiError,
  FeatureLockedError,
  isMockMode,
  lookupBarcode,
  QuotaError,
} from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { usePending } from '@/lib/pending';
import { webviewAvailable } from '@/lib/native-modules';
import { photoPickerAvailable, pickPhoto, prepareImage } from '@/lib/photo';
import { useAppStore } from '@/lib/store';

export default function Scan() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isGym = mode === 'gym';
  const isBarcode = mode === 'barcode';
  const isPhoto = mode === 'photo';
  const isBody = mode === 'body';
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setMeal = usePending((s) => s.setMeal);
  const setEquipment = usePending((s) => s.setEquipment);
  const setBodyReading = usePending((s) => s.setBodyReading);
  const setCapturedPhoto = usePending((s) => s.setCapturedPhoto);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [analyzing, setAnalyzing] = useState(false);
  // The shot being analysed. Showing it — and unmounting the camera — is what
  // makes the wait feel like "reading your photo" rather than a live viewfinder
  // that has stopped responding to the shutter.
  const [shot, setShot] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const frameSize = Math.round(width * 0.78);

  // An InBody machine's QR code doesn't carry readable numbers itself — it
  // links to InBody's own results page. Rather than guess at their
  // undocumented data format, hand the link to inbody-web, which renders
  // that page in-app and captures it through the same AI-vision pipeline
  // already trusted for a photographed printout. Only wired up when
  // react-native-webview is actually linked in this binary (see
  // native-modules.ts) — otherwise this never fires and the camera just
  // behaves like plain photo capture, same as before.
  const onBodyQr = (data: string) => {
    if (analyzing || !/inbody\.com/i.test(data)) return;
    setAnalyzing(true);
    router.replace(`/inbody-web?url=${encodeURIComponent(data)}`);
  };

  const onBarcode = async (data: string) => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const item = await lookupBarcode(data);
      if (!item) {
        Alert.alert(t('barcode.notFoundTitle'), t('barcode.notFound'), [
          {
            text: t('barcode.enterManually'),
            onPress: () => router.replace('/food-edit'),
          },
          {
            text: t('barcode.usePhoto'),
            onPress: () => router.replace('/scan?mode=photo'),
          },
          { text: t('common.cancel'), style: 'cancel', onPress: () => setAnalyzing(false) },
        ]);
        return;
      }
      setMeal({ items: [item], confidence: 1 }, null);
      router.replace('/meal-result');
    } catch {
      Alert.alert(t('common.error'));
      setAnalyzing(false);
    }
  };

  // Downscale, then either stash the photo (manual form) or run AI analysis.
  const processImage = async (uri: string) => {
    const saved = await prepareImage(uri);

    if (isPhoto) {
      setCapturedPhoto(saved.uri);
      router.back();
    } else if (isGym) {
      const analysis = await analyzeEquipment(saved.base64, language);
      useEntitlement.getState().spend();
      setEquipment(analysis, saved.uri);
      router.replace('/gym-result');
    } else if (isBody) {
      const analysis = await analyzeBodyReading({ image: saved.base64 }, language);
      useEntitlement.getState().spend();
      setBodyReading(analysis, saved.uri);
      router.replace('/body-reading?fromScan=1');
    } else {
      const analysis = await analyzeMeal(saved.base64, language);
      useEntitlement.getState().spend();
      setMeal(analysis, saved.uri);
      router.replace('/meal-result');
    }
  };

  /** Out of allowance, or the plan doesn't include this — go to upgrade. */
  const onLocked = (reason: 'quota' | 'equipment') => {
    useEntitlement.getState().refresh();
    router.replace(`/upgrade?reason=${reason}`);
  };

  /** Back to a live viewfinder after a failure, so the shot can be retaken. */
  const reset = () => {
    setAnalyzing(false);
    setShot(null);
  };

  const capture = async () => {
    if (analyzing || !cameraRef.current) return;
    setAnalyzing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      // Freeze on the captured frame before the slow part starts.
      setShot(photo.uri);
      await processImage(photo.uri);
    } catch (err) {
      if (err instanceof QuotaError) return onLocked('quota');
      if (err instanceof FeatureLockedError) return onLocked('equipment');
      if (err instanceof ApiError && err.code === 'ai_credits_exhausted') {
        Alert.alert(t('common.aiCreditsExhaustedTitle'), t('common.aiCreditsExhausted'));
        reset();
        return;
      }
      Alert.alert(t('common.error'));
      reset();
    }
  };

  // Analyze a picture the user already took (meal / equipment / manual photo).
  const pickFromGallery = async () => {
    if (analyzing) return;
    if (!photoPickerAvailable) {
      Alert.alert(t('scan.galleryUnavailableTitle'), t('scan.galleryUnavailable'));
      return;
    }
    try {
      const uri = await pickPhoto();
      if (!uri) return;
      setAnalyzing(true);
      setShot(uri);
      await processImage(uri);
    } catch (err) {
      if (err instanceof QuotaError) return onLocked('quota');
      if (err instanceof FeatureLockedError) return onLocked('equipment');
      if (err instanceof ApiError && err.code === 'ai_credits_exhausted') {
        Alert.alert(t('common.aiCreditsExhaustedTitle'), t('common.aiCreditsExhausted'));
        reset();
        return;
      }
      Alert.alert(t('common.error'));
      reset();
    }
  };

  const busyLabel = isBarcode
    ? t('barcode.searching')
    : isGym
      ? t('scan.analyzingGym')
      : isBody
        ? t('scan.analyzingBody')
        : isPhoto
          ? t('scan.preparingPhoto')
          : t('scan.analyzingMeal');

  // Once there is a shot to work on, the camera comes down. Leaving a live
  // preview running behind a spinner was the confusing part: the viewfinder
  // looked ready while the shutter no longer did anything.
  //
  // Checked before camera permission on purpose: a photo chosen from the
  // library needs no camera, and its progress should still be visible.
  if (shot) return <PhotoProgress uri={shot} label={busyLabel} />;

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.permission, { backgroundColor: theme.background }]}>
        <Text style={[styles.permissionTitle, { color: theme.text }]}>
          {t('scan.noPermissionTitle')}
        </Text>
        <Text style={[styles.permissionBody, { color: theme.textSecondary }]}>
          {t('scan.noPermissionBody')}
        </Text>
        <Button label={t('scan.grantPermission')} onPress={requestPermission} />
        <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={
          isBarcode
            ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }
            : isBody && webviewAvailable
              ? { barcodeTypes: ['qr'] }
              : undefined
        }
        onBarcodeScanned={
          isBarcode
            ? ({ data }) => onBarcode(data)
            : isBody && webviewAvailable
              ? ({ data }) => onBodyQr(data)
              : undefined
        }
      />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={styles.title}>
          {isGym
            ? t('scan.gymTitle')
            : isBody
              ? t('scan.bodyTitle')
              : isBarcode
                ? t('addMenu.scanBarcode')
                : isPhoto
                  ? t('foodEdit.addPhoto')
                  : t('scan.mealTitle')}
        </Text>
        <Text style={styles.hint}>
          {isGym
            ? t('scan.gymHint')
            : isBody
              ? webviewAvailable
                ? t('scan.bodyHintQr')
                : t('scan.bodyHint')
              : isBarcode
                ? t('barcode.hint')
                : t('scan.mealHint')}
        </Text>
        {isMockMode && !isPhoto && <Text style={styles.mockBadge}>{t('scan.mockBadge')}</Text>}
      </View>

      <View pointerEvents="none" style={styles.frameWrap}>
        <FrameCorners size={frameSize} />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {analyzing ? (
          <View style={styles.analyzing}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.analyzingText}>{busyLabel}</Text>
          </View>
        ) : (
          <>
            {!isBarcode && (
              <View style={styles.controlsRow}>
                {/* Always shown. It used to disappear entirely on a build
                    without the image-picker module, which read as a missing
                    feature; tapping it now explains that instead. */}
                <Pressable
                  onPress={pickFromGallery}
                  style={({ pressed }) => [styles.galleryBtn, pressed && { opacity: 0.6 }]}
                  hitSlop={8}
                >
                  <View style={styles.galleryIcon}>
                    <Ionicons name="images" size={24} color="#fff" />
                  </View>
                  <Text style={styles.galleryText}>{t('scan.gallery')}</Text>
                </Pressable>
                <Pressable onPress={capture} style={styles.shutterOuter}>
                  <View style={styles.shutterInner} />
                </Pressable>
                {/* Spacer keeps the shutter centered opposite the gallery button. */}
                <View style={styles.galleryBtn} />
              </View>
            )}
            {isBarcode && (
              <Pressable onPress={() => router.replace('/scan?mode=photo')} style={styles.galleryBtn}>
                <Ionicons name="camera-outline" size={26} color="#fff" />
                <Text style={styles.galleryText}>{t('barcode.usePhoto')}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => router.back()} style={styles.cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Viewfinder corner brackets drawn in SVG: fixed coordinates, immune to the
 * automatic left/right style flipping RTL applies to plain Views.
 */
function FrameCorners({ size }: { size: number }) {
  const len = 34;
  const r = 16;
  const s = 3;
  const m = s / 2;
  const e = size - m;
  const corner = (d: string) => (
    <Path d={d} stroke="rgba(255,255,255,0.9)" strokeWidth={s} strokeLinecap="round" fill="none" />
  );
  return (
    <Svg width={size} height={size}>
      {corner(`M ${m} ${m + len} L ${m} ${m + r} Q ${m} ${m} ${m + r} ${m} L ${m + len} ${m}`)}
      {corner(`M ${e - len} ${m} L ${e - r} ${m} Q ${e} ${m} ${e} ${m + r} L ${e} ${m + len}`)}
      {corner(`M ${m} ${e - len} L ${m} ${e - r} Q ${m} ${e} ${m + r} ${e} L ${m + len} ${e}`)}
      {corner(`M ${e - len} ${e} L ${e - r} ${e} Q ${e} ${e} ${e} ${e - r} L ${e} ${e - len}`)}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 2 },
  mockBadge: {
    color: '#FBBF24',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  frameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.xl,
  },
  galleryBtn: { width: 72, alignItems: 'center', gap: 4 },
  galleryIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  cancel: { marginTop: Spacing.md },
  cancelText: { color: '#fff', fontSize: 16 },
  analyzing: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  analyzingText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  permission: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  permissionTitle: { fontSize: 22, fontWeight: '700' },
  permissionBody: { fontSize: 15, marginBottom: Spacing.md },
});
