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
 * countdown. Continue shows the phone's own prompt now, before training,
 * and is the only button: Apple wants a message like this to lead straight
 * to the prompt (App Store rule 5.1.1(iv), from the review of build 19).
 * Allow or not is the phone's question. Offered in one workout only: if it
 * is passed by, Settings → Notifications can turn alerts on later. The
 * on-screen timer works either way.
 */
export function RestAlertAsk() {
  const { t } = useTranslation();
  const theme = useTheme();
  const asked = useAppStore((s) => s.notifyPrefs?.restAlertAsked === true);
  const setNotifyPrefs = useAppStore((s) => s.setNotifyPrefs);
  // Shown on this screen, and already counted as offered.
  const [shown, setShown] = useState(false);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (asked) return;
    const mod = notifications();
    if (!mod) return;
    let live = true;
    mod
      .getPermissionsAsync()
      .then((p) => {
        // Already on, or the phone will no longer ask: nothing to offer.
        if (!live || p.granted || p.canAskAgain === false) return;
        setShown(true);
        setNotifyPrefs({ restAlertAsked: true });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [asked, setNotifyPrefs]);

  if (!shown || answered) return null;

  const answer = async () => {
    setAnswered(true);
    const mod = notifications();
    if (mod) await requestPermission(mod).catch(() => false);
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
        <Button label={t('common.continue')} onPress={() => void answer()} style={{ flex: 1 }} />
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
