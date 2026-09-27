/**
 * Haptics that degrade to no-ops when the installed binary predates the
 * expo-haptics native module (stale dev build). The native calls can fail
 * either synchronously OR by rejecting a promise, so we guard both.
 */

function safeHaptic(run: (h: typeof import('expo-haptics')) => unknown) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics') as typeof import('expo-haptics');
    const result = run(Haptics) as { catch?: (cb: () => void) => void } | undefined;
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // native module unavailable — skip
  }
}

export function successHaptic() {
  safeHaptic((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
}

export function lightHaptic() {
  safeHaptic((h) => h.impactAsync(h.ImpactFeedbackStyle.Light));
}

/**
 * The rest of the vocabulary. Each buzz means one thing across the app, so
 * the hand learns it: a tick for choosing, a double tap for "careful", a
 * sharp one for "that did not work", and a heavy thud reserved for a
 * personal best.
 */
export function selectionHaptic() {
  safeHaptic((h) => h.selectionAsync());
}

export function warningHaptic() {
  safeHaptic((h) => h.notificationAsync(h.NotificationFeedbackType.Warning));
}

export function errorHaptic() {
  safeHaptic((h) => h.notificationAsync(h.NotificationFeedbackType.Error));
}

export function recordHaptic() {
  safeHaptic((h) => h.impactAsync(h.ImpactFeedbackStyle.Heavy));
}
