import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Screen shell. `footer` renders pinned to the bottom (thumb zone) above the
 * safe-area inset — primary CTAs belong there, not buried in the scroll.
 */
export function Screen({
  children,
  footer,
  scroll = true,
  style,
  scrollRef,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Exposes the page's scroller. A drag-to-reorder list nested in here needs it
   * to auto-scroll when the finger nears the top or bottom of the screen.
   */
  scrollRef?: React.Ref<ScrollView>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const content: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: insets.top + Spacing.md,
    paddingBottom: footer ? Spacing.md : insets.bottom + Spacing.xl,
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[content, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1 }, style]}>{children}</View>
      )}
      {footer ? (
        <View
          style={{
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.sm,
            paddingBottom: insets.bottom + Spacing.md,
            backgroundColor: t.background,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[Type.title, { color: t.text, marginBottom: Spacing.sm }]}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={[Type.body, { color: t.textSecondary, lineHeight: 23, marginBottom: Spacing.lg }]}>
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.card }, cardShadow(t.shadow), style]}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg =
    variant === 'primary' ? t.primary : variant === 'secondary' ? t.cardSubtle : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : t.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1 },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 17, fontWeight: '700' }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Step indicator dots for the onboarding flow. */
export function StepDots({ total, current }: { total: number; current: number }) {
  const t = useTheme();
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i <= current ? t.primary : t.border,
              width: i === current ? 24 : 8,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Selectable option row — emoji cue + label + description, 44pt+ target. */
export function OptionRow({
  label,
  description,
  emoji,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? t.cardSubtle : t.card,
          borderColor: selected ? t.primary : t.border,
        },
        cardShadow(t.shadow),
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {emoji ? <Text style={styles.optionEmoji}>{emoji}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, { color: selected ? t.primary : t.text }]}>{label}</Text>
        {description ? (
          <Text style={[Type.body, { fontSize: 14, color: t.textSecondary, marginTop: 2 }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? t.primary : t.border },
          selected && { backgroundColor: t.primary },
        ]}
      >
        {selected ? <Text style={{ color: t.onPrimary, fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; suffix?: string }) {
  const t = useTheme();
  const { label, suffix, style, ...rest } = props;
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={[Type.caption, { color: t.textSecondary, marginBottom: 6 }]}>{label}</Text>
      <View
        style={[styles.inputWrap, { backgroundColor: t.card, borderColor: t.border }, cardShadow(t.shadow)]}
      >
        <TextInput
          placeholderTextColor={t.textTertiary}
          {...rest}
          style={[styles.input, { color: t.text }, style]}
        />
        {suffix ? (
          <Text style={[Type.caption, { color: t.textTertiary, marginEnd: Spacing.md }]}>{suffix}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Macro tile: colored dot, grams progress, value emphasized over label. */
export function MacroTile({
  label,
  value,
  target,
  color,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit: string;
}) {
  const t = useTheme();
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={[styles.macroTile, { backgroundColor: t.card }, cardShadow(t.shadow)]}>
      <View style={styles.macroHead}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={[Type.caption, { color: t.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.macroValue, { color: t.text }]}>
        {Math.round(value)}
        <Text style={[Type.caption, { color: t.textTertiary }]}> /{target}{unit}</Text>
      </Text>
      <View style={[styles.macroTrack, { backgroundColor: t.border }]}>
        <View style={[styles.macroFill, { backgroundColor: color, width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

/**
 * Big +/- stepper for logging a numeric value (weight, reps, seconds). The
 * value sits in a centered field you can also type into; steppers are laid out
 * LTR so the − is always on the left even in Arabic.
 */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  decimals = 0,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
}) {
  const t = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fmt = (v: number) => (decimals > 0 ? String(v) : String(Math.round(v)));
  // While the field is focused we show the raw text the user is typing, so
  // intermediate values like "7." or "6" aren't reformatted out from under them.
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState('');
  const display = editing ? text : fmt(value);

  const bump = (delta: number) => {
    const next = clamp(Number((value + delta).toFixed(3)));
    onChange(next);
    setText(fmt(next));
  };

  return (
    <View style={{ flex: 1 }}>
      <Text style={[Type.caption, { color: t.textSecondary, marginBottom: 6, textAlign: 'center' }]}>
        {label}
      </Text>
      <View style={[styles.stepperRow, { direction: 'ltr' }]}>
        <Pressable
          onPress={() => bump(-step)}
          style={({ pressed }) => [
            styles.stepperBtn,
            { backgroundColor: t.cardSubtle, borderColor: t.border },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <Ionicons name="remove" size={22} color={t.primary} />
        </Pressable>
        <View style={styles.stepperValueWrap}>
          <TextInput
            value={display}
            onFocus={() => {
              setText(fmt(value));
              setEditing(true);
            }}
            onBlur={() => {
              setEditing(false);
              const n = decimals > 0 ? parseFloat(text) : parseInt(text, 10);
              onChange(Number.isFinite(n) ? clamp(n) : 0);
            }}
            onChangeText={(txt) => {
              const cleaned = txt.replace(decimals > 0 ? /[^0-9.]/g : /[^0-9]/g, '');
              setText(cleaned);
              const n = decimals > 0 ? parseFloat(cleaned) : parseInt(cleaned, 10);
              if (Number.isFinite(n)) onChange(clamp(n));
            }}
            keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
            selectTextOnFocus
            style={[styles.stepperValue, { color: t.text }]}
          />
          {suffix ? (
            <Text style={{ color: t.textTertiary, fontSize: 13, fontWeight: '600' }}>{suffix}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => bump(step)}
          style={({ pressed }) => [
            styles.stepperBtn,
            { backgroundColor: t.cardSubtle, borderColor: t.border },
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <Ionicons name="add" size={22} color={t.primary} />
        </Pressable>
      </View>
    </View>
  );
}

/** Segmented selector for Breakfast / Lunch / Dinner / Snacks. */
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealTypeValue = (typeof MEAL_TYPES)[number];

export function MealTypePicker({
  value,
  onChange,
}: {
  value: MealTypeValue;
  onChange: (v: MealTypeValue) => void;
}) {
  const t = useTheme();
  const { t: translate } = useTranslation();
  return (
    <View style={styles.mealTypeRow}>
      {MEAL_TYPES.map((type) => {
        const active = value === type;
        return (
          <Pressable
            key={type}
            onPress={() => onChange(type)}
            style={[
              styles.mealTypeChip,
              { backgroundColor: active ? t.primary : t.card, borderColor: active ? t.primary : t.border },
            ]}
          >
            <Text
              style={{
                color: active ? t.onPrimary : t.textSecondary,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              {translate(`home.mealTypes.${type}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  button: {
    borderRadius: Radius.full,
    paddingVertical: 16,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  stepperValue: { fontSize: 28, fontWeight: '800', textAlign: 'center', minWidth: 70, padding: 0 },
  mealTypeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  mealTypeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingVertical: 10,
    minHeight: 40,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.lg,
  },
  dot: { height: 8, borderRadius: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    minHeight: 56,
  },
  optionEmoji: { fontSize: 26 },
  optionLabel: { fontSize: 17, fontWeight: '600' },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 17,
    textAlign: 'left',
  },
  macroTile: {
    flex: 1,
    borderRadius: Radius.md,
    padding: 12,
  },
  macroHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroValue: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  macroTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: 6, borderRadius: 3 },
});
