import { Platform, UIManager } from 'react-native';

/**
 * True when this iPhone binary can draw Apple's own tab bar. The native tab
 * host ships inside react-native-screens; an older binary that predates it
 * keeps the JavaScript tab bar instead of rendering an unknown component.
 */
export const nativeTabsAvailable = Platform.OS === 'ios' && UIManager.hasViewManagerConfig('RNSTabsHostIOS');

/**
 * Where the centre "+" sits on screen, for the tour's spotlight. On iPhone it
 * is the middle item of the system tab bar; elsewhere it is the raised disc
 * that pokes above the JavaScript bar.
 */
export function addButtonRect(width: number, height: number, bottomInset: number) {
  if (nativeTabsAvailable) {
    const size = 64;
    const centreY = height - bottomInset - 22;
    return { x: width / 2 - size / 2, y: centreY - size / 2, width: size, height: size };
  }
  return { x: width / 2 - 34, y: height - bottomInset - 82, width: 68, height: 68 };
}
