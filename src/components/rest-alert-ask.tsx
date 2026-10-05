import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { notifications, requestPermission } from '@/lib/reminders';
import { useAppStore } from '@/lib/store';

/**
 * "Alert me when rest ends?" — asked once, at the start of a workout, and
 * only while notifications are still off and the phone may still ask. It
 * used to be the system prompt itself, popping up over the first rest
 * countdown. Allow shows the phone's own prompt now, before training; Not
 * now is final (Settings → Notifications can turn alerts on later). The
 * on-screen timer works either way.
 */
export function RestAlertAsk() {
  const { t } = useTranslation();
  const theme = useTheme();
  const asked = useAppStore((s) => s.notifyPrefs?.restAlertAsked === true);
  const setNotifyPrefs = useAppStore((s) => s.setNotifyPrefs);
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    if (asked) return;
    const mod = notifications();
    if (!mod) return;
    let live = true;
    mod
      .getPermissionsAsync()
      .then((p) => {
        // Already on, or the phone will no longer ask: nothing to offer.
        if (live) setNeeded(!p.granted && p.canAskAgain !== false);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [asked]);

  if (asked || !needed) return null;

  const answer = async (allow: boolean) => {
    setNotifyPrefs({ restAlertAsked: true });
    const mod = notifications();
    if (allow && mod) await requestPermission(mod).catch(() => false);
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, cardShadow(theme.shadow)]} accessibilityRole="summary">
      <View style={styles.row}>
        <View style={[styles.bell, { backgroundColor: theme.surfaceTint }]}>
          <Icon name="notifications-outline" size={20} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15.5 }}>{t('session.restAskTitle')}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 }}>{t('session.restAskBody')}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button label={t('session.restAskAllow')} onPress={() => answer(true)} style={{ flex: 1 }} />
        <Button label={t('session.restAskLater')} variant="secondary" onPress={() => answer(false)} style={{ flex: 1 }} />
      </View>
      <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: Spacing.xs }}>{t('session.restAskNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  bell: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});
