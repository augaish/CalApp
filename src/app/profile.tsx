import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, OptionRow, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildExport, deleteAccount } from '@/lib/account';
import { disconnectWhoop, fetchWhoopStatus, SERVER_URL, whoopAuthorizeUrl } from '@/lib/api';
import { signOutAuth } from '@/lib/auth';
import { useEntitlement } from '@/lib/entitlement';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { syncReminders } from '@/lib/reminders';
import { useAppStore } from '@/lib/store';
import type { Language } from '@/lib/types';

export default function Profile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const language = useAppStore((s) => s.language) ?? 'en';
  const setLanguage = useAppStore((s) => s.setLanguage);
  const targets = useAppStore((s) => s.targets);
  const profile = useAppStore((s) => s.profile);
  const account = useAppStore((s) => s.account);
  const signOut = useAppStore((s) => s.signOut);
  const resetAll = useAppStore((s) => s.resetAll);
  const replayTour = useAppStore((s) => s.replayTour);
  const remindMeals = useAppStore((s) => s.remindMeals);
  const remindWater = useAppStore((s) => s.remindWater);
  const remindWorkouts = useAppStore((s) => s.remindWorkouts);
  const plan = useEntitlement((s) => s.plan);
  const remaining = useEntitlement((s) => s.remaining);
  const limit = useEntitlement((s) => s.limit);
  const setRemindMeals = useAppStore((s) => s.setRemindMeals);
  const setRemindWater = useAppStore((s) => s.setRemindWater);
  const setRemindWorkouts = useAppStore((s) => s.setRemindWorkouts);

  const toggleReminder = async (kind: 'meals' | 'water' | 'workouts', on: boolean) => {
    const save =
      kind === 'meals' ? setRemindMeals : kind === 'water' ? setRemindWater : setRemindWorkouts;
    save(on);
    const { granted } = await syncReminders();
    if (on && !granted) {
      Alert.alert(t('reminders.permissionDenied'));
      save(false);
      await syncReminders();
    }
  };

  const switchLanguage = (lang: Language) => {
    if (lang === language) return;
    setLanguage(lang);
    setI18nLanguage(lang);
    const needsReload = applyRTL(lang);
    if (needsReload) {
      Alert.alert(t('settings.restartNeeded'), t('settings.restartBody'), [
        {
          text: t('settings.restartNow'),
          onPress: async () => {
            try {
              await Updates.reloadAsync();
            } catch {
              // Dev / Expo Go: direction fully applies on next app start.
            }
          },
        },
      ]);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOutAuth();
          signOut();
        },
      },
    ]);
  };

  const exportData = async () => {
    try {
      await Share.share({ message: buildExport() });
    } catch {
      // share sheet dismissed — nothing to do
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(t('legal.deleteAccount'), t('legal.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('legal.deleteConfirmCta'),
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteAccount();
          if (!ok) Alert.alert(t('legal.deletePartial'));
        },
      },
    ]);
  };

  const confirmReset = () => {
    Alert.alert(t('settings.resetData'), t('settings.resetDataConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.reset'), style: 'destructive', onPress: () => resetAll() },
    ]);
  };

  return (
    <Screen>
      <Title>{t('profile.title')}</Title>

      {/* Account */}
      <Card style={styles.accountCard}>
        <View style={[styles.avatar, { backgroundColor: theme.cardSubtle }]}>
          <Ionicons name="person" size={24} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>
            {account?.name ?? t('profile.guest')}
          </Text>
          {account?.email ? (
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{account.email}</Text>
          ) : null}
        </View>
        <Pressable onPress={confirmSignOut} hitSlop={8} style={styles.signOutBtn}>
          <Ionicons name="log-out-outline" size={18} color={theme.danger} />
          <Text style={{ color: theme.danger, fontWeight: '600' }}>{t('profile.signOut')}</Text>
        </Pressable>
      </Card>

      {/* Plan + remaining AI actions */}
      <Text style={[styles.section, { color: theme.textSecondary }]}>{t('upgrade.planSection')}</Text>
      <Pressable onPress={() => router.push('/upgrade')}>
        <Card>
          <View style={styles.planRow}>
            <View style={[styles.planIcon, { backgroundColor: theme.cardSubtle }]}>
              <Ionicons
                name={plan && plan !== 'free' ? 'sparkles' : 'sparkles-outline'}
                size={18}
                color={theme.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>
                {plan === 'proPlus'
                  ? t('upgrade.planProPlus')
                  : plan === 'pro'
                    ? t('upgrade.planPro')
                    : t('upgrade.planFree')}
              </Text>
              {typeof remaining === 'number' && typeof limit === 'number' ? (
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {t('upgrade.remaining', { remaining, limit })}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </View>
        </Card>
      </Pressable>

      <Text style={[styles.section, { color: theme.textSecondary }]}>{t('settings.language')}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <OptionRow label={t('settings.english')} selected={language === 'en'} onPress={() => switchLanguage('en')} />
        </View>
        <View style={styles.flex}>
          <OptionRow label={t('settings.arabic')} selected={language === 'ar'} onPress={() => switchLanguage('ar')} />
        </View>
      </View>

      {targets && profile && (
        <>
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            {t('settings.profile')}
          </Text>
          <Pressable onPress={() => router.push('/edit-profile')}>
            <Card style={styles.linkRow}>
              <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>
                {t('settings.editProfile')}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </Card>
          </Pressable>
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            {t('settings.dailyTargets')}
          </Text>
          <Pressable onPress={() => router.push('/edit-targets')}>
            <Card>
              <Row label={t('onboarding.dailyCalories')} value={`${targets.calories} ${t('common.kcal')}`} />
              <Row label={t('onboarding.protein')} value={`${targets.proteinG} ${t('common.grams')}`} />
              <Row label={t('onboarding.carbs')} value={`${targets.carbsG} ${t('common.grams')}`} />
              <Row label={t('onboarding.fat')} value={`${targets.fatG} ${t('common.grams')}`} />
              <View style={[styles.editHint, { borderTopColor: theme.border }]}>
                <Ionicons name="create-outline" size={16} color={theme.primary} />
                <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '600', flex: 1 }}>
                  {t('editTargets.edit')}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </View>
            </Card>
          </Pressable>
        </>
      )}

      <Text style={[styles.section, { color: theme.textSecondary }]}>
        {t('reminders.section')}
      </Text>
      <Card>
        <View style={styles.kvRow}>
          <Text style={{ color: theme.text, fontSize: 16 }}>{t('reminders.meals')}</Text>
          <Switch
            value={remindMeals}
            onValueChange={(v) => toggleReminder('meals', v)}
            trackColor={{ true: theme.primary }}
          />
        </View>
        <View style={styles.kvRow}>
          <Text style={{ color: theme.text, fontSize: 16 }}>{t('reminders.water')}</Text>
          <Switch
            value={remindWater}
            onValueChange={(v) => toggleReminder('water', v)}
            trackColor={{ true: theme.primary }}
          />
        </View>
        <View style={styles.kvRow}>
          <Text style={{ color: theme.text, fontSize: 16 }}>{t('reminders.workouts')}</Text>
          <Switch
            value={remindWorkouts}
            onValueChange={(v) => toggleReminder('workouts', v)}
            trackColor={{ true: theme.primary }}
          />
        </View>
      </Card>

      <Text style={[styles.section, { color: theme.textSecondary }]}>
        {t('profile.connections')}
      </Text>
      <Card>
        <ConnectionRow icon="watch-outline" label={t('profile.appleHealth')} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <WhoopConnectionRow />
      </Card>

      <Text style={[styles.section, { color: theme.textSecondary }]}>{t('settings.about')}</Text>
      <Pressable
        onPress={() => {
          replayTour();
          router.back();
        }}
      >
        <Card style={styles.linkRow}>
          <Ionicons name="sparkles-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 16, flex: 1, marginStart: Spacing.sm }}>
            {t('tour.replay')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Card>
      </Pressable>
      <Card>
        <Row label={t('settings.version')} value={Constants.expoConfig?.version ?? '1.0.0'} />
      </Card>

      <Text style={[styles.section, { color: theme.textSecondary }]}>{t('legal.section')}</Text>
      <Pressable onPress={() => Linking.openURL(`${SERVER_URL}/privacy`)}>
        <Card style={styles.linkRow}>
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 16, flex: 1, marginStart: Spacing.sm }}>
            {t('legal.privacy')}
          </Text>
          <Ionicons name="open-outline" size={16} color={theme.textTertiary} />
        </Card>
      </Pressable>
      <Pressable onPress={() => Linking.openURL(`${SERVER_URL}/terms`)}>
        <Card style={styles.linkRow}>
          <Ionicons name="document-text-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 16, flex: 1, marginStart: Spacing.sm }}>
            {t('legal.terms')}
          </Text>
          <Ionicons name="open-outline" size={16} color={theme.textTertiary} />
        </Card>
      </Pressable>
      <Pressable onPress={exportData}>
        <Card style={styles.linkRow}>
          <Ionicons name="download-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 16, flex: 1, marginStart: Spacing.sm }}>
            {t('legal.exportData')}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </Card>
      </Pressable>

      <Pressable onPress={confirmReset}>
        <Card style={[styles.linkRow, { borderColor: theme.danger, borderWidth: 1 }]}>
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
          <Text style={{ color: theme.danger, fontSize: 16, flex: 1, marginStart: Spacing.sm }}>
            {t('settings.resetData')}
          </Text>
        </Card>
      </Pressable>

      <Pressable onPress={confirmDeleteAccount}>
        <Card style={[styles.linkRow, { borderColor: theme.danger, borderWidth: 1 }]}>
          <Ionicons name="person-remove-outline" size={18} color={theme.danger} />
          <Text style={{ color: theme.danger, fontSize: 16, flex: 1, marginStart: Spacing.sm }}>
            {t('legal.deleteAccount')}
          </Text>
        </Card>
      </Pressable>
    </Screen>
  );
}

function ConnectionRow({
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
      <View style={[styles.soonBadge, { backgroundColor: theme.cardSubtle }]}>
        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
          {t('profile.comingSoon')}
        </Text>
      </View>
    </View>
  );
}

/**
 * The other row in this card (ConnectionRow) is still a "coming soon"
 * placeholder — Apple Health needs a native HealthKit module this app
 * doesn't have yet. WHOOP only needs an OAuth round trip through a browser,
 * so it gets a real, working row instead.
 */
function WhoopConnectionRow() {
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
      style={({ pressed }) => [styles.connRow, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="fitness-outline" size={22} color={theme.text} />
      <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{t('profile.whoop')}</Text>
      <View style={[styles.soonBadge, { backgroundColor: theme.cardSubtle }]}>
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

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.kvRow}>
      <Text style={{ color: theme.text, fontSize: 16 }}>{label}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 16 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center' },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 8 },
  soonBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
