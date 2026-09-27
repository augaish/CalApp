import { Alert, Platform } from 'react-native';

import i18n from './i18n';
import { useAppStore } from './store';

/**
 * Permission to send AI requests.
 *
 * Meal photos, body-composition reports, typed meals and coach messages go
 * to third-party AI providers (Anthropic and DeepSeek) to be answered. The
 * App Store asks that people be told this and give their permission before
 * any of it leaves the phone, so the first AI action asks, once; the answer
 * is kept, and Profile → Privacy can change it. Saying "Not now" sends
 * nothing and asks again the next time an AI feature is used.
 *
 * The web build is a test bench, not a shipped app, and answers yes.
 */

let asking: Promise<boolean> | null = null;

export function aiConsentGiven(): boolean {
  return Platform.OS === 'web' || useAppStore.getState().aiConsent === 'granted';
}

export function ensureAiConsent(): Promise<boolean> {
  if (aiConsentGiven()) return Promise.resolve(true);
  // Two AI calls at once (a scan and its follow-up) share one question.
  if (asking) return asking;
  asking = new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      asking = null;
      if (ok) useAppStore.getState().setAiConsent('granted');
      resolve(ok);
    };
    Alert.alert(
      i18n.t('aiConsent.title'),
      i18n.t('aiConsent.body'),
      [
        { text: i18n.t('aiConsent.notNow'), style: 'cancel', onPress: () => done(false) },
        { text: i18n.t('aiConsent.allow'), onPress: () => done(true) },
      ],
      { cancelable: true, onDismiss: () => done(false) },
    );
  });
  return asking;
}
