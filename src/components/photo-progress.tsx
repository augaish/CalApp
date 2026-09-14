import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Spacing } from '@/constants/theme';

/**
 * The photo being worked on, dimmed, with progress over it.
 *
 * Used everywhere an image is being analysed so the wait looks the same whether
 * the photo came from the camera or the library. Showing the actual photo — and,
 * on the camera screen, unmounting the viewfinder behind it — is what stops the
 * wait from looking like a frozen camera.
 */
export function PhotoProgress({ uri, label, done = false }: { uri: string; label: string; done?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.scrim}>
        <Text style={styles.label}>{done ? t('scan.analyzingDone') : label}</Text>
        <View style={styles.bar}>
          <ProgressBar
            done={done}
            trackColor="rgba(255,255,255,0.25)"
            fillColor="#fff"
            textColor="#fff"
          />
        </View>
        <Text style={styles.hint}>{t('scan.analyzingHint')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scrim: {
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
  label: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  bar: { alignSelf: 'stretch', marginTop: Spacing.xs },
  hint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
