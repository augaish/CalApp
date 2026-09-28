import { useColorScheme } from 'react-native';

import { Colors, type ThemeColors } from '@/constants/theme';
import { useAppStore } from '@/lib/store';

/**
 * The palette for the current appearance: the person's choice in Profile,
 * or the phone's own setting when they leave it on System.
 *
 * On builds made before the app declared support for dark mode (app.json
 * userInterfaceStyle), iOS always reports light, so System stays light
 * there while an explicit Dark still works.
 */
export function useTheme(): ThemeColors {
  const pref = useAppStore((s) => s.appearance) ?? 'light';
  const system = useColorScheme();
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return Colors[scheme];
}

/** 'light' or 'dark', resolved the same way, for the few places that need the name. */
export function useSchemeName(): 'light' | 'dark' {
  const pref = useAppStore((s) => s.appearance) ?? 'light';
  const system = useColorScheme();
  return pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
}
