import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design system — 60/30/10 color rule:
 * 60% neutral background, 30% text/dark elements, 10% brand green (CTAs, key numbers).
 * Text hierarchy comes from opacity steps, not extra colors.
 */
export const Colors = {
  light: {
    text: '#101613',
    textSecondary: 'rgba(16,22,19,0.6)',
    textTertiary: 'rgba(16,22,19,0.4)',
    background: '#F6F8F7',
    card: '#FFFFFF',
    cardSubtle: 'rgba(16,185,129,0.06)',
    border: 'rgba(16,22,19,0.08)',
    primary: '#10B981',
    primaryDark: '#0B9E6E',
    onPrimary: '#FFFFFF',
    danger: '#E5484D',
    warning: '#D97706',
    protein: '#3B82F6',
    carbs: '#F59E0B',
    fat: '#A855F7',
    shadow: '#0A3D2E',
  },
  dark: {
    text: '#F4F7F5',
    textSecondary: 'rgba(244,247,245,0.62)',
    textTertiary: 'rgba(244,247,245,0.4)',
    background: '#0C100E',
    card: '#171C19',
    cardSubtle: 'rgba(52,211,153,0.08)',
    border: 'rgba(244,247,245,0.08)',
    primary: '#34D399',
    primaryDark: '#10B981',
    onPrimary: '#06281C',
    danger: '#F2555A',
    warning: '#FBBF24',
    protein: '#60A5FA',
    carbs: '#FBBF24',
    fat: '#C084FC',
    shadow: '#000000',
  },
} as const;

export type ThemeColors = Record<keyof typeof Colors.light, string>;

/** Max 4 sizes, 3 weights — hierarchy by size + weight + opacity. */
export const Type = {
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -1 } as TextStyle,
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 } as TextStyle,
  body: { fontSize: 16, fontWeight: '400' } as TextStyle,
  caption: { fontSize: 13, fontWeight: '600' } as TextStyle,
};

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

/** 4/8-point grid only. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

/** Soft tinted shadow — never harsh gray on colored backgrounds. */
export function cardShadow(shadowColor: string): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor,
      shadowOpacity: 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    default: { elevation: 2 },
  });
}
