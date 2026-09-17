import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { knownLabel } from '@/lib/recipes';
import type { NutrientKey } from '@/lib/types';

/*
 * Handoff v1.1 primitives. Each one is a contract the boards reuse: the same
 * section title, segmented tab, settings row, status pill, tile and empty
 * state on every screen, so a screen is assembled rather than styled.
 */

/** 20sp section heading with an optional trailing link. */
export function SectionTitle({
  children,
  action,
  style,
}: {
  children: ReactNode;
  action?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionRow, style]}>
      <Text style={[Type.section, { color: theme.text, flex: 1 }]}>{children}</Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.sectionAction, { backgroundColor: theme.surfaceTint }, pressed && { opacity: 0.7 }]}
        >
          {action.icon && <Ionicons name={action.icon} size={15} color={theme.primary} />}
          <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Local tabs (Today | Meal plan; Enter manually | Read from photo). */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { key: K; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.surfaceTint }, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.segment,
              on && { backgroundColor: theme.primary },
              pressed && !on && { opacity: 0.7 },
            ]}
          >
            {o.icon && <Ionicons name={o.icon} size={16} color={on ? theme.onPrimary : theme.primaryDark} />}
            <Text style={{ color: on ? theme.onPrimary : theme.primaryDark, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A selectable filter chip (All · Favourites · Quick). */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.primary : theme.surfaceTint },
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon && <Ionicons name={icon} size={14} color={selected ? theme.onPrimary : theme.primaryDark} />}
      <Text style={{ color: selected ? theme.onPrimary : theme.primaryDark, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** Small square icon on a tinted surface — the leading glyph of a row or tile. */
export function IconTile({
  icon,
  size = 36,
  color,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: theme.surfaceTint, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={icon} size={Math.round(size * 0.55)} color={color ?? theme.primary} />
    </View>
  );
}

/** The large illustration panel beside a next-step card (bundled vector, never a fetched image). */
export function IllustrationTile({ icon, width = 104, height = 108 }: { icon: keyof typeof Ionicons.glyphMap; width?: number; height?: number }) {
  const theme = useTheme();
  return (
    <View style={{ width, height, borderRadius: Radius.control, backgroundColor: theme.surfaceTint, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={Math.round(height * 0.5)} color={theme.primary} />
    </View>
  );
}

/** Planned / Logged / Needs review / Active / Calgym — a label, never only a colour. */
export function StatusPill({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'planned' | 'logged' | 'review' | 'active' | 'neutral' | 'ai';
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const ink =
    tone === 'logged' || tone === 'active'
      ? theme.successText
      : tone === 'review'
        ? theme.warningText
        : tone === 'planned' || tone === 'ai'
          ? theme.primaryDark
          : theme.textSecondary;
  const bg =
    tone === 'logged' || tone === 'active'
      ? 'rgba(37,102,71,0.12)'
      : tone === 'review'
        ? 'rgba(121,80,23,0.12)'
        : theme.surfaceTint;
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={13} color={ink} />}
      <Text style={{ color: ink, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Settings-style row: icon, title, subtitle, and a value, badge or chevron. */
export function SettingsRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  badge,
  onPress,
  chevron = true,
  last = false,
  accessibilityLabel,
  right,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  badge?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
  accessibilityLabel?: string;
  right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon && <IconTile icon={icon} color={iconColor} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 1 }} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {!!value && <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '600' }}>{value}</Text>}
      {badge}
      {chevron && onPress && <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} style={styles.chevron} />}
    </Pressable>
  );
}

/** A grouped card of SettingsRows with an optional heading. */
export function RowGroup({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={style}>
      {!!title && <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6, marginStart: 4 }]}>{title}</Text>}
      <View style={[styles.group, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>{children}</View>
    </View>
  );
}

/** One of the three shortcut tiles under a summary (Recipes · Shopping · This week). */
export function Tile({
  icon,
  title,
  subtitle,
  onPress,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [styles.tile, { backgroundColor: theme.card }, cardShadow(theme.shadow), pressed && { opacity: 0.8 }, style]}
    >
      <View style={styles.tileHead}>
        <Ionicons name={icon} size={20} color={theme.primary} />
        <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
      </View>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }} numberOfLines={2}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 1 }} numberOfLines={2}>
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

/** C11 — the missing prerequisite and one useful action; never an inert button. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  secondary,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  secondary?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  compact?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.card }, cardShadow(theme.shadow), compact && { paddingVertical: Spacing.md }]}>
      <IconTile icon={icon} size={44} />
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, textAlign: 'center', marginTop: Spacing.sm }}>{title}</Text>
      {!!body && (
        <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 4 }}>{body}</Text>
      )}
      {(action || secondary) && (
        <View style={styles.emptyActions}>
          {action && <ActionButton label={action.label} icon={action.icon} onPress={action.onPress} />}
          {secondary && <ActionButton label={secondary.label} icon={secondary.icon} onPress={secondary.onPress} variant="secondary" />}
        </View>
      )}
    </View>
  );
}

/** A compact 48dp action for cards and rows (the full-width Button is for footers). */
export function ActionButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.primary : theme.surfaceTint;
  const fg = variant === 'primary' ? theme.onPrimary : theme.primaryDark;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, pressed && { opacity: 0.85 }, style]}
    >
      {icon && <Ionicons name={icon} size={17} color={fg} />}
      {/* Two lines before any clipping: an action label that ends in an ellipsis is not an action label. */}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 14, textAlign: 'center', flexShrink: 1 }} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** C12 — search with a clear control; the list it filters keeps its scroll. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  clearLabel,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  clearLabel: string;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Ionicons name="search" size={18} color={theme.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        autoFocus={autoFocus}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={[styles.searchInput, { color: theme.text }]}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={clearLabel}>
          <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}

/** Labelled progress with the percentage printed inside the fill (Nutrition today). */
export function ProgressTrack({ value, max, color, height = 12, approx = false }: { value: number; max: number; color?: string; height?: number; approx?: boolean }) {
  const theme = useTheme();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const percent = Math.round(pct * 100);
  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceTint, height, borderRadius: height / 2 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <View style={[styles.fill, { backgroundColor: color ?? theme.primary, width: `${percent}%`, height, borderRadius: height / 2 }]}>
        {pct > 0.18 && <Text style={styles.trackLabel}>{approx ? '≥' : ''}{percent}%</Text>}
      </View>
    </View>
  );
}

/** Protein · Carbs · Fat as "60 / 120 g" columns with their colour dots. */
export function MacroRow({
  values,
  targets,
  labels,
  unit,
  unknown,
}: {
  values: { proteinG: number; carbsG: number; fatG: number };
  targets?: { proteinG: number; carbsG: number; fatG: number } | null;
  labels: { protein: string; carbs: string; fat: string };
  unit: string;
  /** Nutrients whose value is a known subtotal (shown as ≥n, or — when nothing is known). */
  unknown?: NutrientKey[];
}) {
  const theme = useTheme();
  const cols: { key: 'proteinG' | 'carbsG' | 'fatG'; label: string; color: string }[] = [
    { key: 'proteinG', label: labels.protein, color: theme.protein },
    { key: 'carbsG', label: labels.carbs, color: theme.carbs },
    { key: 'fatG', label: labels.fat, color: theme.fat },
  ];
  return (
    <View style={styles.macroRow}>
      {cols.map((c, i) => (
        <View key={c.key} style={[styles.macroCol, i > 0 && { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: theme.border }]}>
          <View style={styles.macroHead}>
            <View style={[styles.dot, { backgroundColor: c.color }]} />
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{c.label}</Text>
          </View>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>
            {knownLabel(Math.round(values[c.key]), !!unknown?.includes(c.key))}
            {targets && (
              <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
                {' '}/ {Math.round(targets[c.key])} {unit}
              </Text>
            )}
            {!targets && <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}> {unit}</Text>}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** C07 — old and new values, a signed delta and the planned day before → after. */
export function DeltaRows({
  rows,
  note,
}: {
  rows: { label: string; value: string; emphasis?: boolean }[];
  note?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.delta, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
      {rows.map((r, i) => (
        <View key={r.label} style={[styles.deltaRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
          <Text style={{ color: theme.textSecondary, fontSize: 14, flex: 1 }}>{r.label}</Text>
          {/* Neutral ink on purpose: a signed change is information, not a verdict. */}
          <Text style={{ color: theme.text, fontSize: r.emphasis ? 16 : 14, fontWeight: r.emphasis ? '800' : '700' }}>{r.value}</Text>
        </View>
      ))}
      {!!note && (
        <View style={[styles.deltaNote, { backgroundColor: theme.surfaceTint }]}>
          <Ionicons name="information-circle-outline" size={15} color={theme.primaryDark} />
          <Text style={{ color: theme.primaryDark, fontSize: 12, flex: 1 }}>{note}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * C07 variant for changes that do not fit on one line: each affected item is
 * a stacked block — its name, then the original value, then the new value or
 * outcome — every line wrapping on its own. Built for the reschedule summary,
 * where an Arabic workout name next to an English date overlapped in a
 * label/value row.
 */
export function ChangeSummary({
  items,
  note,
}: {
  items: { key: string; title: string; from: { label: string; value: string }; to: { label: string; value: string }; emphasis?: boolean }[];
  note?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.delta, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
      {items.map((item, i) => (
        <View
          key={item.key}
          style={[styles.changeBlock, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
          accessible
          accessibilityLabel={`${item.title}. ${item.from.label}: ${item.from.value}. ${item.to.label}: ${item.to.value}`}
        >
          <Text style={{ color: theme.text, fontSize: item.emphasis ? 16 : 15, fontWeight: '800' }}>{item.title}</Text>
          <View style={styles.changeLine}>
            <Text style={[Type.caption, { color: theme.textSecondary }]}>{item.from.label}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '600' }}>{item.from.value}</Text>
          </View>
          <View style={styles.changeLine}>
            <Text style={[Type.caption, { color: theme.textSecondary }]}>{item.to.label}</Text>
            {/* Neutral ink on purpose: a change is information, not a verdict. */}
            <Text style={{ color: theme.text, fontSize: item.emphasis ? 16 : 14, fontWeight: '800' }}>{item.to.value}</Text>
          </View>
        </View>
      ))}
      {!!note && (
        <View style={[styles.deltaNote, { backgroundColor: theme.surfaceTint }]}>
          <Ionicons name="information-circle-outline" size={15} color={theme.primaryDark} />
          <Text style={{ color: theme.primaryDark, fontSize: 12, flex: 1 }}>{note}</Text>
        </View>
      )}
    </View>
  );
}

/** Seven-day strip; `selected` is compared by calendar day. */
export function DayStrip({
  days,
  selected,
  onSelect,
  locale,
  onGradient = false,
  disabledAfter,
}: {
  days: Date[];
  selected: Date;
  onSelect: (d: Date) => void;
  locale: string;
  onGradient?: boolean;
  disabledAfter?: Date;
}) {
  const theme = useTheme();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return (
    <View style={styles.dayStrip}>
      {days.map((day) => {
        const active = sameDay(day, selected);
        const disabled = !!disabledAfter && day.getTime() > disabledAfter.getTime() && !sameDay(day, disabledAfter);
        const bg = active
          ? onGradient
            ? theme.primaryDark
            : theme.primary
          : onGradient
            ? 'rgba(255,255,255,0.22)'
            : theme.surfaceTint;
        const ink = active ? theme.onPrimary : onGradient ? theme.onGradient : theme.primaryDark;
        return (
          <Pressable
            key={day.toDateString()}
            onPress={() => onSelect(day)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={day.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            style={[styles.day, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }]}
          >
            <Text style={{ color: ink, fontSize: 11, fontWeight: '600', opacity: active ? 1 : 0.85 }}>
              {day.toLocaleDateString(locale, { weekday: 'narrow' })}
            </Text>
            <Text style={{ color: ink, fontSize: 15, fontWeight: '800' }}>{day.toLocaleDateString(locale, { day: 'numeric' })}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small informational line with an icon (scope notes, hints). */
export function InfoLine({ icon = 'information-circle-outline', children }: { icon?: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={15} color={theme.textTertiary} />
      <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.ms },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: Radius.pill },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: Radius.control + 4 },
  segment: { flex: 1, minHeight: 40, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.control },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: Radius.pill },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, paddingVertical: Spacing.ms, minHeight: 56 },
  chevron: { marginStart: 2 },
  group: { borderRadius: Radius.module, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  tile: { flex: 1, borderRadius: Radius.module, padding: Spacing.ms, minHeight: 88 },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  empty: { borderRadius: Radius.module, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md },
  emptyActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: TOUCH - 4, paddingHorizontal: Spacing.ms, borderRadius: Radius.control },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.ms, minHeight: TOUCH },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, textAlign: 'left' },
  track: { overflow: 'hidden', width: '100%' },
  fill: { alignItems: 'flex-end', justifyContent: 'center', paddingEnd: 6 },
  trackLabel: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  macroRow: { flexDirection: 'row', marginTop: Spacing.ms },
  macroCol: { flex: 1, paddingHorizontal: 8 },
  macroHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  delta: { borderRadius: Radius.module, paddingHorizontal: Spacing.md, paddingTop: 2, marginBottom: Spacing.md },
  deltaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.ms },
  changeBlock: { paddingVertical: Spacing.ms, gap: 6 },
  changeLine: { gap: 1 },
  deltaNote: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: Radius.control, marginBottom: Spacing.md },
  dayStrip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', borderRadius: Radius.control, paddingVertical: 8, gap: 2, minHeight: TOUCH },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
});
