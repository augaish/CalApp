import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button, Screen } from '@/components/ui';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setModule } from '@/lib/api';
import { alertProblem } from '@/lib/alerts';
import { useEntitlement } from '@/lib/entitlement';
import { successHaptic } from '@/lib/feedback';
import type { Module } from '@/lib/plan-gates';

const OPTIONS: { key: Module; icon: 'restaurant' | 'barbell' }[] = [
  { key: 'food', icon: 'restaurant' },
  { key: 'training', icon: 'barbell' },
];

/**
 * Essentials' focus: Food or Training (Health comes with both). Chosen once
 * and changeable every 30 days; nothing recorded in either is ever deleted,
 * so switching back finds it all where it was.
 */
export default function Focus() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const current = useEntitlement((s) => s.module) ?? null;
  const nextChange = useEntitlement((s) => s.moduleNextChange) ?? null;
  const [picked, setPicked] = useState<Module | null>(current);
  const [busy, setBusy] = useState(false);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'long' });
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const save = async () => {
    if (!picked || picked === current) return close();
    setBusy(true);
    const out = await setModule(picked);
    setBusy(false);
    if (out.kind === 'ok') {
      successHaptic();
      await useEntitlement.getState().refresh();
      close();
    } else if (out.kind === 'locked') {
      alertProblem(t('plans.focusLockedTitle'), t('plans.focusLockedBody', { date: date(out.nextChange) }));
    } else {
      alertProblem(t('common.error'), t('common.offlineBody'));
    }
  };

  return (
    <Screen
      header={<PageHeader title={t('plans.focusTitle')} close />}
      footer={<Button label={t('plans.focusSave')} loading={busy} disabled={!picked || busy} onPress={save} />}
    >
      <Text style={[Type.title, { color: theme.text }]}>{t('plans.focusTitle')}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 21, marginBottom: Spacing.md }}>{t('plans.focusBody')}</Text>

      <View style={{ gap: Spacing.sm }} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => {
          const selected = picked === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setPicked(o.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.option,
                { backgroundColor: theme.card, borderColor: selected ? theme.primary : theme.border, borderWidth: selected ? 2 : 1 },
              ]}
            >
              <Icon name={o.icon} size={26} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>
                  {t(`plans.module.${o.key}`)}
                  {current === o.key ? <Text style={{ color: theme.primary, fontSize: 12 }}>{`  ${t('plans.current')}`}</Text> : null}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{t(`plans.moduleIncludes.${o.key}`)}</Text>
              </View>
              <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.primary : theme.textTertiary} />
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.note, { backgroundColor: theme.surfaceTint }]}>
        <Icon name="shield-checkmark-outline" size={16} color={theme.primaryDark} />
        <Text style={{ color: theme.primaryDark, fontSize: 13, lineHeight: 18, flex: 1 }}>
          {nextChange ? t('plans.focusNextChange', { date: date(nextChange) }) : t('plans.focusRule')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, borderRadius: Radius.md, padding: Spacing.md },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: Radius.control, marginTop: Spacing.md },
});
