import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
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
  startWith = 'day',
}: {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
  /** Defaults to today — a body reading can't be dated in the future. */
  maxDate?: Date;
  /** 'year' for a date years back (a birth date): years, then months, then days. */
  startWith?: 'day' | 'year';
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const [month, setMonth] = useState(() => startOfMonth(value));
  // Tapping the title steps back: days → years → months → days.
  const [mode, setMode] = useState<'day' | 'year' | 'month'>(startWith);
  const max = maxDate ?? new Date();
  // Each opening starts from the current value, in the starting view
  // (adjusted during render when `visible` flips, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setMonth(startOfMonth(value));
      setMode(startWith);
    }
  }

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
      <View style={styles.backdrop}>
        {/* Tap outside to close: a layer behind the sheet, not a wrapper around
            it — wrapped, VoiceOver read the whole sheet as one "Close" button. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View onStartShouldSetResponder={() => true}
          style={[styles.sheet, { backgroundColor: theme.background }]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <View style={styles.monthRow}>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              hitSlop={10}
              disabled={mode !== 'day'}
              style={mode !== 'day' && styles.hidden}
              accessibilityElementsHidden={mode !== 'day'}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.previousMonth')}
            >
              <Icon name="chevron-back" size={22} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={() => setMode(mode === 'day' ? 'year' : 'day')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.chooseYear')}
              style={styles.titleBtn}
            >
              <Text style={[styles.monthLabel, { color: mode === 'day' ? theme.text : theme.primary }]}>
                {mode === 'year'
                  ? String(month.getFullYear())
                  : month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
              </Text>
              <Icon name={mode === 'day' ? 'chevron-down' : 'chevron-up'} size={16} color={theme.primary} />
            </Pressable>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              hitSlop={10}
              disabled={nextMonthInFuture || mode !== 'day'}
              style={mode !== 'day' && styles.hidden}
              accessibilityElementsHidden={mode !== 'day'}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.nextMonth')}
            >
              <Icon
                name="chevron-forward"
                size={22}
                color={nextMonthInFuture ? theme.border : theme.text}
              />
            </Pressable>
          </View>

          {mode !== 'day' ? (
            <MonthYearGrid
              mode={mode}
              value={month}
              max={max}
              locale={locale}
              onYear={(y) => {
                setMonth(new Date(y, Math.min(month.getMonth(), y === max.getFullYear() ? max.getMonth() : 11), 1));
                setMode('month');
              }}
              onMonth={(m) => {
                setMonth(new Date(month.getFullYear(), m, 1));
                setMode('day');
              }}
            />
          ) : (
          <>
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
                <Pressable
                  key={i}
                  onPress={() => pick(d)}
                  disabled={isFuture}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isFuture }}
                  accessibilityLabel={d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      isSelected && { backgroundColor: theme.primary },
                      isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.primary },
                    ]}
                  >
                    <Text maxFontSizeMultiplier={1.2}
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
          </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Years (newest first, back to 100 years before the limit), or the twelve
 * months of the shown year: the quick way to a date far from today, used by
 * the date picker and the day calendar. Anything after `max` is disabled.
 */
export function MonthYearGrid({
  mode,
  value,
  max,
  locale,
  onYear,
  onMonth,
}: {
  mode: 'year' | 'month';
  value: Date;
  max: Date;
  locale: string;
  onYear: (year: number) => void;
  onMonth: (month: number) => void;
}) {
  const theme = useTheme();
  const scrolled = useRef(false);
  const cell = (label: string, selected: boolean, disabled: boolean, onPress: () => void, key: string | number, a11y?: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected, disabled }}
      style={styles.pickCell}
    >
      <View style={[styles.pickPill, selected && { backgroundColor: theme.primary }]}>
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ color: selected ? theme.onPrimary : disabled ? theme.textTertiary : theme.text, fontWeight: selected ? '700' : '500', fontSize: 16 }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );

  if (mode === 'month') {
    return (
      <View style={styles.monthGrid}>
        {Array.from({ length: 12 }, (_, m) => {
          const d = new Date(value.getFullYear(), m, 1);
          const future = d.getTime() > max.getTime();
          return cell(d.toLocaleDateString(locale, { month: 'short' }), m === value.getMonth(), future, () => onMonth(m), m, d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }));
        })}
      </View>
    );
  }

  const top = max.getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => top - i);
  // Rows of 4, 52pt tall: open with the chosen year in the middle of the view.
  const row = Math.floor(years.indexOf(value.getFullYear()) / 4);
  const offset = Math.max(0, (row - 2) * 52);
  return (
    <ScrollView
      ref={(sv) => {
        if (sv && !scrolled.current) {
          scrolled.current = true;
          requestAnimationFrame(() => sv.scrollTo({ y: offset, animated: false }));
        }
      }}
      style={{ maxHeight: 300 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.yearGrid}>
        {years.map((y) => cell(String(y), y === value.getFullYear(), false, () => onYear(y), y))}
      </View>
    </ScrollView>
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
    // Mirrors in Arabic like the grid below it; the Icon flips the chevrons.
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  hidden: { opacity: 0 },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: Spacing.sm },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  pickCell: { width: '25%', height: 52, alignItems: 'center', justifyContent: 'center' },
  pickPill: { minWidth: 64, height: 40, paddingHorizontal: 10, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  weekdayRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
