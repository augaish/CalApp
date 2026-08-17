import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  analyzeEquipment,
  analyzeMeal,
  FeatureLockedError,
  isMockMode,
  lookupBarcode,
  QuotaError,
} from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

// Gallery picking needs the expo-image-picker native module, which only exists
// in a build that bundled it. Detect it WITHOUT importing the package (its
// module throws at import time when the native side is missing), so older
// builds that receive this JS over-the-air keep working — the button is simply
// hidden until they install the new build.
const galleryAvailable = requireOptionalNativeModule('ExponentImagePicker') != null;

export default function Scan() {
  const { mode, pick } = useLocalSearchParams<{ mode?: string; pick?: string }>();
  const isGym = mode === 'gym';
  const isBarcode = mode === 'barcode';
  const isPhoto = mode === 'photo';
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setMeal = usePending((s) => s.setMeal);
  const setEquipment = usePending((s) => s.setEquipment);
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
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: 1024 });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      base64: true,
      compress: 0.7,
      format: SaveFormat.JPEG,
    });
    const base64 = saved.base64 ?? '';

    if (isPhoto) {
      setCapturedPhoto(saved.uri);
      router.back();
    } else if (isGym) {
      const analysis = await analyzeEquipment(base64, language);
      useEntitlement.getState().spend();
      setEquipment(analysis, saved.uri);
      router.replace('/gym-result');
    } else {
      const analysis = await analyzeMeal(base64, language);
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
      Alert.alert(t('common.error'));
      reset();
    }
  };

  // Analyze a picture the user already took (meal / equipment / manual photo).
  // Loaded lazily so the module's native binding is only touched when present.
  const pickFromGallery = async () => {
    if (analyzing) return;
    if (!galleryAvailable) {
      Alert.alert(t('scan.galleryUnavailableTitle'), t('scan.galleryUnavailable'));
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return;
      setAnalyzing(true);
      setShot(asset.uri);
      await processImage(asset.uri);
    } catch (err) {
      if (err instanceof QuotaError) return onLocked('quota');
      if (err instanceof FeatureLockedError) return onLocked('equipment');
      Alert.alert(t('common.error'));
      reset();
    }
  };

  // "Upload photo" in the add menu lands here with the picker already opening,
  // so choosing a photo is one tap and does not look like a camera screen that
  // happens to have a gallery button hidden in the corner.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (pick !== '1' || autoPicked.current) return;
    autoPicked.current = true;
    void pickFromGallery();
    // Runs once per mount; pickFromGallery is stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  const busyLabel = isBarcode
    ? t('barcode.searching')
    : isGym
      ? t('scan.analyzingGym')
      : isPhoto
        ? t('scan.preparingPhoto')
        : t('scan.analyzingMeal');

  // Once there is a shot to work on, the camera comes down. Leaving a live
  // preview running behind a spinner was the confusing part: the viewfinder
  // looked ready while the shutter no longer did anything.
  //
  // Checked before camera permission on purpose: a photo chosen from the
  // library needs no camera, and its progress should still be visible.
  if (shot) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.busyScrim}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.busyText}>{busyLabel}</Text>
          <Text style={styles.busyHint}>{t('scan.analyzingHint')}</Text>
        </View>
      </View>
    );
  }

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
            : undefined
        }
        onBarcodeScanned={isBarcode ? ({ data }) => onBarcode(data) : undefined}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={styles.title}>
          {isGym
            ? t('scan.gymTitle')
            : isBarcode
              ? t('addMenu.scanBarcode')
              : isPhoto
                ? t('foodEdit.addPhoto')
                : t('scan.mealTitle')}
        </Text>
        <Text style={styles.hint}>
          {isGym ? t('scan.gymHint') : isBarcode ? t('barcode.hint') : t('scan.mealHint')}
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
  busyScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  busyText: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  busyHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
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
