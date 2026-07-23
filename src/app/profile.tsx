import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, OptionRow, Screen, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applyRTL, setI18nLanguage } from '@/lib/i18n';
import { setMealReminders, setWaterReminders } from '@/lib/reminders';
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
  const remindMeals = useAppStore((s) => s.remindMeals);
  const remindWater = useAppStore((s) => s.remindWater);
  const setRemindMeals = useAppStore((s) => s.setRemindMeals);
  const setRemindWater = useAppStore((s) => s.setRemindWater);

  const toggleReminder = async (kind: 'meals' | 'water', on: boolean) => {
    const apply = kind === 'meals' ? setMealReminders : setWaterReminders;
    const save = kind === 'meals' ? setRemindMeals : setRemindWater;
    const ok = await apply(on);
    if (on && !ok) {
      Alert.alert(t('reminders.permissionDenied'));
      save(false);
      return;
    }
    save(on);
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
      { text: t('profile.signOut'), style: 'destructive', onPress: () => signOut() },
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
          <Card>
            <Row label={t('onboarding.dailyCalories')} value={`${targets.calories} ${t('common.kcal')}`} />
            <Row label={t('onboarding.protein')} value={`${targets.proteinG} ${t('common.grams')}`} />
            <Row label={t('onboarding.carbs')} value={`${targets.carbsG} ${t('common.grams')}`} />
            <Row label={t('onboarding.fat')} value={`${targets.fatG} ${t('common.grams')}`} />
          </Card>
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
      </Card>

      <Text style={[styles.section, { color: theme.textSecondary }]}>
        {t('profile.connections')}
      </Text>
      <Card>
        <ConnectionRow icon="watch-outline" label={t('profile.appleHealth')} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ConnectionRow icon="fitness-outline" label={t('profile.whoop')} />
      </Card>

      <Text style={[styles.section, { color: theme.textSecondary }]}>{t('settings.about')}</Text>
      <Card>
        <Row label={t('settings.version')} value={Constants.expoConfig?.version ?? '1.0.0'} />
      </Card>
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
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
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
