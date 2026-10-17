import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic } from '@/lib/feedback';
import { moveKind } from '@/lib/move-day';
import type { AppState } from '@/lib/store';

/** Labels for weekdays 0–6 in the active locale (Jan 7 2024 was a Sunday). */
export function weekdayName(i: number, locale: string, format: 'short' | 'long' = 'long'): string {
  return new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: format });
}

/** A weekday's workout by its name, or "Monday's workout" when it has none. */
export function dayWorkoutName(week: AppState['schedule'], wd: number, locale: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  return week[wd]?.title?.trim() || t('schedule.dayWorkout', { day: weekdayName(wd, locale) });
}

/**
 * "Move Push to…": the week as it is, one day picked, and a button that says
 * what will happen — Move to Sunday (a rest day) or Swap Monday and
 * Wednesday (a day that trains).
 */
export function MoveDaySheet({
  week,
  from,
  onClose,
  onMove,
}: {
  week: AppState['schedule'];
  from: number;
  onClose: () => void;
  onMove: (to: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const [to, setTo] = useState<number | null>(null);
  const name = dayWorkoutName(week, from, locale, t);
  const trains = (wd: number) => (week[wd]?.exerciseIds?.length ?? 0) > 0;
  const day = (wd: number) => weekdayName(wd, locale);
  const kind = to === null ? null : moveKind(week, to);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.md }]} accessibilityViewIsModal>
          <View style={[styles.grab, { backgroundColor: theme.border }]} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: 20 }} accessibilityRole="header">
                {t('schedule.moveTitle', { name })}
              </Text>
              <Text style={[Type.caption, { color: theme.textSecondary, marginTop: 2 }]}>{t('schedule.moveSub')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Icon name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420, marginTop: Spacing.sm }} contentContainerStyle={{ gap: 6 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
              const isFrom = wd === from;
              const picked = wd === to;
              const label = trains(wd) ? dayWorkoutName(week, wd, locale, t) : t('schedule.rest');
              return (
                <Pressable
                  key={wd}
                  disabled={isFrom}
                  onPress={() => {
                    lightHaptic();
                    setTo(wd);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: picked, disabled: isFrom }}
                  accessibilityLabel={`${day(wd)}: ${label}`}
                  style={({ pressed }) => [
                    styles.dayRow,
                    { backgroundColor: picked ? theme.card : theme.surfaceTint, borderColor: picked ? theme.primary : 'transparent', opacity: isFrom ? 0.55 : 1 },
                    pressed && !isFrom && { opacity: 0.7 },
                  ]}
                >
                  <Text style={{ width: 64, color: theme.textSecondary, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
                    {weekdayName(wd, locale, locale === 'ar' ? 'long' : 'short').toUpperCase()}
                  </Text>
                  <Text style={{ flex: 1, color: trains(wd) ? theme.text : theme.textTertiary, fontWeight: trains(wd) ? '800' : '600', fontSize: 15 }} numberOfLines={1}>
                    {label}
                  </Text>
                  {isFrom ? (
                    <View style={[styles.badge, { backgroundColor: theme.surfaceTint }]}>
                      <Text style={{ color: theme.primaryDark, fontSize: 11, fontWeight: '800' }}>{t('schedule.moveNow')}</Text>
                    </View>
                  ) : picked ? (
                    <Icon name="checkmark-circle" size={20} color={theme.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {to !== null && (
            <View style={[styles.note, { backgroundColor: theme.surfaceTint }]} accessibilityLiveRegion="polite">
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>
                {kind === 'swap'
                  ? t('schedule.swapNote', { name, to: day(to), from: day(from), other: dayWorkoutName(week, to, locale, t) })
                  : t('schedule.moveNote', { name, to: day(to), from: day(from) })}
              </Text>
            </View>
          )}

          <View style={{ marginTop: Spacing.md, gap: 2 }}>
            <Button
              label={to === null ? t('schedule.moveCta', { to: '…' }) : kind === 'swap' ? t('schedule.swapCta', { from: day(from), to: day(to) }) : t('schedule.moveCta', { to: day(to) })}
              icon="swap-horizontal"
              disabled={to === null}
              onPress={() => to !== null && onMove(to)}
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,16,33,0.45)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: Spacing.page, paddingTop: 10, ...cardShadow('#000') },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.control, paddingHorizontal: 12, minHeight: 48, borderWidth: 2 },
  badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  note: { borderRadius: Radius.control, padding: 10, marginTop: Spacing.sm },
});
