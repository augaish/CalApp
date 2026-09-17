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
    success: '#2E9E5C',
    protein: '#3B82F6',
    carbs: '#E39A2E',
    fat: '#C46FB0',
    shadow: '#3A2D5C',
    gradientStart: '#9B86D4',
    gradientEnd: '#7FB89B',
    onGradient: '#FFFFFF',
    water: '#38BDF8',
    // Handoff v1.1 surfaces and text-safe status inks. The brand purple and
    // gradient above are the authentic Calgym values and stay; these are the
    // neutral surfaces and the darker status variants the boards use for
    // small text, where the bright success/danger fills would not pass 4.5:1.
    surfaceTint: '#EEE9F7',
    successText: '#256647',
    errorText: '#A32F3D',
    warningText: '#795017',
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
    success: '#4ADE80',
    protein: '#6BA3F5',
    carbs: '#FBBF24',
    fat: '#DB8CCB',
    shadow: '#000000',
    gradientStart: '#7E68B8',
    gradientEnd: '#5E9E80',
    onGradient: '#FFFFFF',
    water: '#38BDF8',
    surfaceTint: 'rgba(167,139,224,0.18)',
    successText: '#7ED9A4',
    errorText: '#F49AA0',
    warningText: '#F2C879',
  },
} as const;

export type ThemeColors = Record<keyof typeof Colors.light, string>;

/**
 * Handoff v1.1 hierarchy: main title 28, section 20, body 16, secondary 14,
 * supporting 12. Weight and opacity do the rest; no further sizes.
 */
export const Type = {
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -1 } as TextStyle,
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 } as TextStyle,
  section: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 } as TextStyle,
  body: { fontSize: 16, fontWeight: '400' } as TextStyle,
  secondary: { fontSize: 14, fontWeight: '500' } as TextStyle,
  caption: { fontSize: 13, fontWeight: '600' } as TextStyle,
  /** Small uppercase eyebrow above a card title ("TRAINING", "PLANNED LUNCH"). */
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' } as TextStyle,
};

/** Standard transitions (ms); reduced motion should skip them entirely. */
export const Motion = { fast: 150, standard: 200, max: 250 } as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

/** 4/8-point grid; `page` is the 20dp outer margin every root screen keeps. */
export const Spacing = {
  xs: 4,
  sm: 8,
  ms: 12,
  md: 16,
  page: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** control 12 · module 20 · pill. `md`/`xl` remain for existing sheets. */
export const Radius = {
  sm: 12,
  control: 12,
  md: 16,
  lg: 20,
  module: 20,
  xl: 28,
  full: 999,
  pill: 999,
} as const;

/** Minimum touch target from the accessibility contract. */
export const TOUCH = 48;

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
