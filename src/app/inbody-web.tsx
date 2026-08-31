import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeBodyReading, ApiError, FeatureLockedError, QuotaError } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { webviewAvailable, viewShotAvailable } from '@/lib/native-modules';
import { usePending } from '@/lib/pending';
import { prepareImage } from '@/lib/photo';
import { useAppStore } from '@/lib/store';

/** The two body-scan native modules — react-native-webview and
 * react-native-view-shot — dynamically imported only once we've confirmed
 * (via native-modules.ts) they're actually linked in this binary. A static
 * top-level import of either would throw the moment this file is evaluated
 * on an older binary that predates them, crashing JS delivered over-the-air
 * for every tester, not just whoever opens this screen. */
type Loaded = {
  WebView: typeof import('react-native-webview').WebView;
  captureRef: typeof import('react-native-view-shot').captureRef;
};

/** Scanning an InBody machine's QR code lands here with the InBody results
 * URL it encodes — the QR itself carries no readable numbers, just a link to
 * InBody's own results page. Rendering that page in-app and capturing it
 * feeds the exact same AI-vision pipeline already trusted for a photographed
 * printout, instead of guessing at InBody's undocumented QR data format. */
export default function InBodyWeb() {
  const { url } = useLocalSearchParams<{ url?: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setBodyReading = usePending((s) => s.setBodyReading);

  const [mods, setMods] = useState<Loaded | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);
  const webviewRef = useRef<InstanceType<Loaded['WebView']> | null>(null);

  useEffect(() => {
    if (!webviewAvailable || !viewShotAvailable) return;
    Promise.all([import('react-native-webview'), import('react-native-view-shot')]).then(
      ([webviewMod, viewShotMod]) => {
        setMods({ WebView: webviewMod.WebView, captureRef: viewShotMod.captureRef });
      },
    );
  }, []);

  const onLocked = (reason: 'quota' | 'coach') => {
    useEntitlement.getState().refresh();
    router.replace(`/upgrade?reason=${reason}`);
  };

  const capture = async () => {
    if (busy || !mods || !shotRef.current) return;
    setBusy(true);
    try {
      const uri = await mods.captureRef(shotRef, { format: 'jpg', quality: 0.9 });
      const saved = await prepareImage(uri);
      const analysis = await analyzeBodyReading({ image: saved.base64 }, language);
      useEntitlement.getState().spend();
      setBodyReading(analysis, saved.uri);
      router.replace('/body-reading?fromScan=1');
    } catch (err) {
      if (err instanceof QuotaError) return onLocked('quota');
      if (err instanceof FeatureLockedError) return onLocked('coach');
      Alert.alert(
        err instanceof ApiError
          ? t(
              err.code === 'invalid_request'
                ? 'bodyReading.errorInvalidFile'
                : err.code === 'ai_credits_exhausted'
                  ? 'common.aiCreditsExhausted'
                  : 'bodyReading.errorAnalysisFailed',
            )
          : t('bodyReading.errorOffline'),
      );
      setBusy(false);
    }
  };

  if (!url || !webviewAvailable || !viewShotAvailable) {
    return (
      <View style={[styles.unavailable, { backgroundColor: theme.background }]}>
        <Text style={[styles.unavailableTitle, { color: theme.text }]}>
          {t('inbodyWeb.unavailableTitle')}
        </Text>
        <Text style={[styles.unavailableBody, { color: theme.textSecondary }]}>
          {t('inbodyWeb.unavailable')}
        </Text>
        <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const WebView = mods?.WebView;

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm, backgroundColor: theme.card }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t('inbodyWeb.title')}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: theme.textSecondary, backgroundColor: theme.card }]}>
        {t('inbodyWeb.hint')}
      </Text>

      <View ref={shotRef} collapsable={false} style={styles.webviewWrap}>
        {WebView && (
          <WebView
            ref={webviewRef}
            source={{ uri: url }}
            style={styles.webview}
            onLoadEnd={() => setPageLoaded(true)}
            startInLoadingState
          />
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: theme.card }]}>
        <Button
          label={t('inbodyWeb.reload')}
          variant="ghost"
          onPress={() => webviewRef.current?.reload()}
          style={styles.reloadBtn}
        />
        <Button
          label={t('inbodyWeb.capture')}
          onPress={capture}
          loading={busy}
          disabled={!pageLoaded}
          style={styles.captureBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700' },
  hint: { fontSize: 13, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  webviewWrap: { flex: 1 },
  webview: { flex: 1 },
  bottomBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  reloadBtn: { flex: 1 },
  captureBtn: { flex: 2 },
  unavailable: { flex: 1, justifyContent: 'center', padding: Spacing.lg, gap: Spacing.sm },
  unavailableTitle: { fontSize: 22, fontWeight: '700' },
  unavailableBody: { fontSize: 15, marginBottom: Spacing.md },
});
