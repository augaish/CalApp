import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeEquipment, analyzeMeal, isMockMode } from '@/lib/api';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

export default function Scan() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isGym = mode === 'gym';
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setMeal = usePending((s) => s.setMeal);
  const setEquipment = usePending((s) => s.setEquipment);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [analyzing, setAnalyzing] = useState(false);

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

  const capture = async () => {
    if (analyzing || !cameraRef.current) return;
    setAnalyzing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      // Downscale before upload: keeps API fast and cheap without hurting accuracy.
      const context = ImageManipulator.manipulate(photo.uri);
      context.resize({ width: 1024 });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({
        base64: true,
        compress: 0.7,
        format: SaveFormat.JPEG,
      });
      const base64 = saved.base64 ?? '';

      if (isGym) {
        const analysis = await analyzeEquipment(base64, language);
        setEquipment(analysis, saved.uri);
        router.replace('/gym-result');
      } else {
        const analysis = await analyzeMeal(base64, language);
        setMeal(analysis, saved.uri);
        router.replace('/meal-result');
      }
    } catch {
      Alert.alert(t('common.error'));
      setAnalyzing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={styles.title}>{isGym ? t('scan.gymTitle') : t('scan.mealTitle')}</Text>
        <Text style={styles.hint}>{isGym ? t('scan.gymHint') : t('scan.mealHint')}</Text>
        {isMockMode && <Text style={styles.mockBadge}>{t('scan.mockBadge')}</Text>}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {analyzing ? (
          <View style={styles.analyzing}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.analyzingText}>
              {isGym ? t('scan.analyzingGym') : t('scan.analyzingMeal')}
            </Text>
          </View>
        ) : (
          <>
            <Pressable onPress={capture} style={styles.shutterOuter}>
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
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
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
