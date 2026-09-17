import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { disconnectWhoop, fetchWhoopStatus, whoopAuthorizeUrl } from '@/lib/api';
import { lightHaptic, successHaptic } from '@/lib/feedback';

/**
 * A wearable or platform this app cannot connect to yet. Shown as a plain
 * availability label, never as a Connect button that does nothing (S26).
 */
export function ConnectionRow({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.connRow}>
      <Ionicons name={icon} size={22} color={theme.text} />
      <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{label}</Text>
      <View style={[styles.badge, { backgroundColor: theme.cardSubtle }]}>
        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
          {t('profile.comingSoon')}
        </Text>
      </View>
    </View>
  );
}

/**
 * WHOOP only needs an OAuth round trip through a browser, so it gets a real,
 * working row. Lived on Profile until Health became a destination; it is the
 * same row in both places, so the state and the confirmation copy are shared
 * rather than duplicated.
 */
export function WhoopConnectionRow() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = () => fetchWhoopStatus().then((s) => setStatus(s?.connected ? 'connected' : 'disconnected'));

  // The connect button opens a system browser session, so coming back to this
  // screen — not the openAuthSessionAsync promise resolving — is the one
  // signal that reliably fires whether the browser closed itself via the
  // calapp:// redirect or the user just switched back to the app manually.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchWhoopStatus().then((s) => alive && setStatus(s?.connected ? 'connected' : 'disconnected'));
      return () => {
        alive = false;
      };
    }, []),
  );

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(whoopAuthorizeUrl(), 'calapp://whoop-callback');
      // The confirmation page closes the browser session almost the instant
      // it redirects here, well before anyone could read it — the reason
      // travels in the URL instead, so a failure is visible in the app.
      if (result.type === 'success') {
        // Avoids the URL/URLSearchParams polyfill, which some RN engines
        // parse unreliably for a non-http(s) custom scheme like this one.
        const params = new URLSearchParams(result.url.split('?')[1] ?? '');
        if (params.get('status') === 'success') {
          successHaptic();
        } else {
          Alert.alert(t('profile.whoopConnectFailed'), params.get('reason') || undefined);
        }
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const confirmDisconnect = () => {
    Alert.alert(t('profile.whoopDisconnectConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.disconnect'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const ok = await disconnectWhoop();
          setBusy(false);
          if (ok) {
            lightHaptic();
            setStatus('disconnected');
          }
        },
      },
    ]);
  };

  return (
    <Pressable
      onPress={status === 'connected' ? confirmDisconnect : connect}
      disabled={busy || status === 'loading'}
      accessibilityRole="button"
      accessibilityLabel={`${t('profile.whoop')} · ${
        status === 'connected' ? t('profile.whoopConnected') : t('profile.connect')
      }`}
      style={({ pressed }) => [styles.connRow, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="fitness-outline" size={22} color={theme.text} />
      <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{t('profile.whoop')}</Text>
      <View style={[styles.badge, { backgroundColor: theme.cardSubtle }]}>
        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
          {status === 'loading'
            ? t('common.loading')
            : status === 'connected'
              ? t('profile.whoopConnected')
              : t('profile.connect')}
        </Text>
      </View>
    </Pressable>
  );
}

export const connectionStyles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});

const styles = StyleSheet.create({
  connRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
