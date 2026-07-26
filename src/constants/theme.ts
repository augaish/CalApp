import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design system — 60/30/10 color rule:
 * 60% neutral background, 30% text/dark elements, 10% brand green (CTAs, key numbers).
 * Text hierarchy comes from opacity steps, not extra colors.
 */
export const Colors = {
  light: {
    text: '#211B2E',
    textSecondary: 'rgba(33,27,46,0.6)',
    textTertiary: 'rgba(33,27,46,0.4)',
    background: '#F5F3FA',
    card: '#FFFFFF',
    cardSubtle: 'rgba(122,106,184,0.09)',
    border: 'rgba(33,27,46,0.08)',
    primary: '#6D5AAB',
    primaryDark: '#59478F',
    onPrimary: '#FFFFFF',
    danger: '#E5484D',
    warning: '#C77D2E',
    protein: '#3B82F6',
    carbs: '#E39A2E',
    fat: '#C46FB0',
    shadow: '#3A2D5C',
    gradientStart: '#9B86D4',
    gradientEnd: '#7FB89B',
    onGradient: '#FFFFFF',
    water: '#38BDF8',
  },
  dark: {
    text: '#F1EEF8',
    textSecondary: 'rgba(241,238,248,0.62)',
    textTertiary: 'rgba(241,238,248,0.4)',
    background: '#141021',
    card: '#1E1832',
    cardSubtle: 'rgba(167,139,224,0.14)',
    border: 'rgba(241,238,248,0.08)',
    primary: '#A78BE0',
    primaryDark: '#8B72C4',
    onPrimary: '#1B1330',
    danger: '#F2555A',
    warning: '#FBBF24',
    protein: '#6BA3F5',
    carbs: '#FBBF24',
    fat: '#DB8CCB',
    shadow: '#000000',
    gradientStart: '#7E68B8',
    gradientEnd: '#5E9E80',
    onGradient: '#FFFFFF',
    water: '#38BDF8',
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
