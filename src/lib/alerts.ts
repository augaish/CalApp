import { Alert, type AlertButton } from 'react-native';

import { errorHaptic, warningHaptic } from './feedback';

/**
 * Alerts that carry their meaning to the hand as well as the eye: a
 * problem arrives with the error buzz, and a question before something is
 * deleted or discarded arrives with the warning buzz. Same arguments as
 * Alert.alert, so a call site changes by one word.
 */
export function alertProblem(title: string, message?: string, buttons?: AlertButton[]): void {
  errorHaptic();
  Alert.alert(title, message, buttons);
}

export function alertDestructive(title: string, message?: string, buttons?: AlertButton[]): void {
  warningHaptic();
  Alert.alert(title, message, buttons);
}
