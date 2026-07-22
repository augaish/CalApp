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

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const base: ViewStyle = {
    flexGrow: 1,
    backgroundColor: t.background,
    paddingHorizontal: Spacing.md,
    paddingTop: insets.top + Spacing.sm,
    paddingBottom: insets.bottom + Spacing.lg,
  };
  if (!scroll) {
    return <View style={[base, { flex: 1 }, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[base, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: t.text }]}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.subtitle, { color: t.textSecondary }]}>{children}</Text>;
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
    <View
      style={[
        { backgroundColor: t.card, borderColor: t.border },
        styles.card,
        style,
      ]}
    >
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
    variant === 'primary' ? t.primary : variant === 'secondary' ? t.card : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : t.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: variant === 'secondary' ? t.border : 'transparent',
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Selectable option row used in onboarding (activity level, goal, …). */
export function OptionRow({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: t.card,
          borderColor: selected ? t.primary : t.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      <Text style={[styles.optionLabel, { color: selected ? t.primary : t.text }]}>{label}</Text>
      {description ? (
        <Text style={[styles.optionDesc, { color: t.textSecondary }]}>{description}</Text>
      ) : null}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textSecondary}
        {...rest}
        style={[
          styles.input,
          { backgroundColor: t.card, borderColor: t.border, color: t.text },
          style,
        ]}
      />
    </View>
  );
}

/** Horizontal progress bar with label, used for macros. */
export function MacroBar({
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
    <View style={{ flex: 1 }}>
      <Text style={[styles.macroLabel, { color: t.textSecondary }]}>{label}</Text>
      <View style={[styles.macroTrack, { backgroundColor: t.border }]}>
        <View
          style={[styles.macroFill, { backgroundColor: color, width: `${pct * 100}%` }]}
        />
      </View>
      <Text style={[styles.macroValue, { color: t.text }]}>
        {Math.round(value)}/{target} {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', marginBottom: Spacing.xs },
  subtitle: { fontSize: 16, lineHeight: 22, marginBottom: Spacing.lg },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  button: {
    borderRadius: Radius.full,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonLabel: { fontSize: 17, fontWeight: '600' },
  option: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  optionLabel: { fontSize: 17, fontWeight: '600' },
  optionDesc: { fontSize: 14, marginTop: 2 },
  fieldLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 17,
    textAlign: 'left',
  },
  macroLabel: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  macroTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  macroFill: { height: 8, borderRadius: 4 },
  macroValue: { fontSize: 12, marginTop: 4 },
});
