import React from 'react';
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
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
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
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
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
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 17, fontWeight: '700' }}>{label}</Text>
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
