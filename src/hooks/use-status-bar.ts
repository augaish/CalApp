import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

import { useSchemeName } from '@/hooks/use-theme';

/**
 * The clock and icons' colour while this screen is in front: 'light' over the
 * brand gradient or a photo, 'page' over the plain page background (dark ink
 * in light mode, light ink in dark mode). Without it, white icons sat
 * unreadable on the light pages, most visibly on Android.
 */
export function useStatusBar(over: 'light' | 'page' | null) {
  const scheme = useSchemeName();
  const style = over === 'light' || scheme === 'dark' ? 'light' : 'dark';
  useFocusEffect(
    useCallback(() => {
      // null: something inside (a header) decides.
      if (over) setStatusBarStyle(style, true);
    }, [over, style]),
  );
}
