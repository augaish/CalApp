import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * A controlled calendar picker as a bottom-sheet modal — for a form field
 * that needs an arbitrary date (an old report's real date, for example),
 * as opposed to the /calendar route, which drives the app-wide "which day
 * am I viewing" and writes straight to that global store.
 */
export function DatePickerModal({
  visible,
  value,
  onChange,
  onClose,
  maxDate,
}: {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
  /** Defaults to today — a body reading can't be dated in the future. */
  maxDate?: Date;
}) {
  const { i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const [month, setMonth] = useState(() => startOfMonth(value));
  const max = maxDate ?? new Date();

  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'narrow' }),
  );

  const nextMonthInFuture = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() > max.getTime();

  const pick = (d: Date) => {
    if (d.getTime() > max.getTime() && !sameDay(d, max)) return;
    onChange(d);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: theme.background }]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <View style={styles.monthRow}>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: theme.text }]}>
              {month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              hitSlop={10}
              disabled={nextMonthInFuture}
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={nextMonthInFuture ? theme.border : theme.text}
              />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((w, i) => (
              <Text key={i} style={[styles.weekday, { color: theme.textTertiary }]}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.cell} />;
              const isSelected = sameDay(d, value);
              const isToday = sameDay(d, new Date());
              const isFuture = d.getTime() > max.getTime() && !sameDay(d, max);
              return (
                <Pressable key={i} onPress={() => pick(d)} disabled={isFuture} style={styles.cell}>
                  <View
                    style={[
                      styles.dayCircle,
                      isSelected && { backgroundColor: theme.primary },
                      isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={{
                        color: isSelected ? theme.onPrimary : isFuture ? theme.textTertiary : theme.text,
                        fontWeight: isSelected || isToday ? '700' : '500',
                      }}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.md },
  monthRow: {
    flexDirection: 'row',
    // Fixed LTR order: RN auto-mirrors 'row' for RTL, but the chevron
    // glyphs are static and don't flip with it. See Overview headerCenter.
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
