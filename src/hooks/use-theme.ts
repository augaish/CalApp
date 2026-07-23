import { Colors, type ThemeColors } from '@/constants/theme';

/**
 * CalApp is light-first: fresh, healthy look regardless of system dark mode
 * (matches the reference design). Colors.dark stays for a future toggle.
 */
export function useTheme(): ThemeColors {
  return Colors.light;
}
