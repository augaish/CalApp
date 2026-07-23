/**
 * Haptics that degrade to no-ops when the installed binary predates the
 * expo-haptics native module (stale dev build) — never crash over feedback.
 */

export function successHaptic() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // native module unavailable — skip
  }
}

export function lightHaptic() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // native module unavailable — skip
  }
}
