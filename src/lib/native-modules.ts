import { NativeModules, UIManager } from 'react-native';

/**
 * True only when the current native binary has react-native-webview linked.
 * Checked purely against the native side (UIManager's registered view
 * managers) without ever importing the `react-native-webview` package
 * itself — importing a native module that isn't linked throws immediately
 * at module-evaluation time, which would crash JS shipped over-the-air to
 * an older binary that predates this dependency (see prepareImage's note
 * on the same problem with expo-image-picker). Callers gate both the UI
 * entry point and any dynamic `import('react-native-webview')` on this.
 */
export const webviewAvailable = UIManager.getViewManagerConfig('RNCWebView') != null;

/** Same idea for react-native-view-shot. */
export const viewShotAvailable = NativeModules.RNViewShot != null;
