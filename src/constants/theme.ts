import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111827',
    textSecondary: '#6B7280',
    background: '#F8FAF9',
    card: '#FFFFFF',
    border: '#E5E7EB',
    primary: '#10B981',
    primaryDark: '#059669',
    onPrimary: '#FFFFFF',
    danger: '#EF4444',
    warning: '#F59E0B',
    protein: '#3B82F6',
    carbs: '#F59E0B',
    fat: '#A855F7',
  },
  dark: {
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    background: '#0B0F0E',
    card: '#161B19',
    border: '#2A312E',
    primary: '#34D399',
    primaryDark: '#10B981',
    onPrimary: '#052E22',
    danger: '#F87171',
    warning: '#FBBF24',
    protein: '#60A5FA',
    carbs: '#FBBF24',
    fat: '#C084FC',
  },
} as const;

export type ThemeColors = Record<keyof typeof Colors.light, string>;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;
