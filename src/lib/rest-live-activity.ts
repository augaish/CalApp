import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';

import i18n from './i18n';
import { useAppStore } from './store';

/**
 * The rest countdown on the lock screen: in the Dynamic Island and a Live
 * Activity on iPhone (iOS 16.2+), and an ongoing notification with a large
 * countdown on Android (modules/rest-countdown). Alongside the end-of-rest
 * alert in rest-alert.ts.
 *
 * It follows the same stored value, `activeSession.restEndsAt`: a rest that
 * starts shows a live countdown to that moment, a changed rest updates it,
 * and a rest that is skipped, finished or over ends it. The system draws the
 * countdown itself, so it keeps ticking with the app asleep.
 *
 * Only on a binary that carries the Live Activity extension: the library
 * calls its native module unguarded, so it is loaded only when that module
 * exists, and every older build simply goes without.
 */

type LiveActivityModule = typeof import('expo-live-activity');

const LA: LiveActivityModule | null =
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoLiveActivity') != null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-live-activity') as LiveActivityModule)
    : null;

/**
 * Android: the app's own module, present from the build that added it.
 * Version 2 also carries −15 s / +15 s / Skip buttons and turns into the
 * "Rest over" alert itself (an alarm), so the separate alert in
 * rest-alert.ts stands down; a change made from the notification comes back
 * as `onRestChange`, or from `takePending()` when the app was closed.
 */
interface RestCountdownModule {
  version?: number;
  show(endsAtMs: number, title: string, subtitle: string, overTitle?: string, overBody?: string): void;
  hide(): void;
  setLabels?(minus: string, plus: string, skip: string, countdownChannel: string, alertChannel: string): void;
  takePending?(): number | null;
  canExact?(): boolean;
  openExactSettings?(): void;
  addListener?(event: 'onRestChange', listener: (e: { endsAtMs: number }) => void): { remove(): void };
}
const RC: RestCountdownModule | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<RestCountdownModule>('RestCountdown') : null;
const RC2 = RC && (RC.version ?? 1) >= 2 ? RC : null;

export const liveActivitiesAvailable = LA != null || RC != null;

/** The Android countdown sounds the end of the rest itself. */
export const nativeRestAlerts = RC2 != null;

/** Whether the end-of-rest alert can be exact (Android 14+ asks); null where it doesn't apply. */
export function exactRestAlerts(): boolean | null {
  if (!RC2?.canExact) return null;
  try {
    return RC2.canExact();
  } catch {
    return null;
  }
}

export function openExactAlarmSettings(): void {
  try {
    RC2?.openExactSettings?.();
  } catch {
    // No such screen on this phone.
  }
}

/** A −15 s / +15 s / Skip from the notification, into the session. */
function applyPending(endsAtMs?: number | null) {
  if (!RC2) return;
  let ends = endsAtMs;
  try {
    // Read (and clear) it either way, so it is applied once.
    const pending = RC2.takePending?.() ?? null;
    if (ends == null) ends = pending;
  } catch {
    // Nothing waiting.
  }
  if (ends == null) return;
  const s = useAppStore.getState();
  if (!s.activeSession) return;
  const iso = ends > Date.now() + 1000 ? new Date(ends).toISOString() : null;
  if (s.activeSession.restEndsAt !== iso) s.updateSession({ restEndsAt: iso });
}

const CONFIG = {
  backgroundColor: '#1E1832',
  titleColor: '#FFFFFF',
  subtitleColor: '#D9D2F0',
  progressViewTint: '#A78BE0',
  progressViewLabelColor: '#FFFFFF',
  timerType: 'digital' as const,
  deepLinkUrl: '/session',
  padding: { horizontal: 20, top: 16, bottom: 16 },
};

let current: string | undefined;
let last: string | null | undefined;

function remember(id: string | undefined) {
  current = id;
  const s = useAppStore.getState();
  if (s.activeSession && s.activeSession.restActivityId !== id) s.updateSession({ restActivityId: id });
}

function end() {
  if (RC) {
    try {
      RC.hide();
    } catch {
      // Nothing showing.
    }
    return;
  }
  const id = current ?? useAppStore.getState().activeSession?.restActivityId;
  if (!LA || !id) return;
  try {
    LA.stopActivity(id, { title: i18n.t('session.restOverTitle') });
  } catch {
    // Already gone (ended by the system or dismissed by the person).
  }
  remember(undefined);
}

function apply(endsAt: string | null, next: string | undefined) {
  const ends = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(ends) || ends <= Date.now() + 1000) {
    end();
    return;
  }
  if (RC2) {
    try {
      RC2.setLabels?.(
        i18n.t('session.restMinus'),
        i18n.t('session.restPlus'),
        i18n.t('session.skipRest'),
        i18n.t('session.restCountdownChannel'),
        i18n.t('session.restChannel'),
      );
      RC2.show(ends, i18n.t('session.restLiveTitle'), next || i18n.t('session.restOverBody'), i18n.t('session.restOverTitle'), next || i18n.t('session.restOverBody'));
    } catch (err) {
      console.warn('rest countdown failed:', err);
    }
    return;
  }
  if (RC) {
    try {
      RC.show(ends, i18n.t('session.restLiveTitle'), next || i18n.t('session.restOverBody'));
    } catch (err) {
      console.warn('rest countdown failed:', err);
    }
    return;
  }
  if (!LA) return;
  const state = {
    title: i18n.t('session.restLiveTitle'),
    subtitle: next || i18n.t('session.restOverBody'),
    progressBar: { date: ends },
  };
  const id = current ?? useAppStore.getState().activeSession?.restActivityId;
  try {
    if (id) {
      LA.updateActivity(id, state);
      current = id;
      return;
    }
  } catch {
    // The old one is gone; start afresh below.
  }
  try {
    remember(LA.startActivity(state, CONFIG) || undefined);
  } catch (err) {
    // Live Activities switched off in Settings, or too many running.
    console.warn('rest live activity failed:', err);
  }
}

let started = false;

/** Follow the session's rest from now on. Safe to call more than once. */
export function startRestLiveActivity(): void {
  if (started || (!LA && !RC)) return;
  started = true;
  // A change made from the notification while the app was closed.
  applyPending();
  const s = useAppStore.getState().activeSession;
  last = s?.restEndsAt ?? null;
  // A countdown left from before a relaunch: keep it if its rest is still
  // running, end it if not.
  apply(last, s?.restNext);
  useAppStore.subscribe((st) => {
    const endsAt = st.activeSession?.restEndsAt ?? null;
    if (endsAt === last) return;
    last = endsAt;
    apply(endsAt, st.activeSession?.restNext);
  });
  // The countdown stops at zero on its own but stays up; coming back to the
  // app after the rest is over clears it.
  try {
    RC2?.addListener?.('onRestChange', (e) => applyPending(e.endsAtMs));
  } catch {
    // Picked up on the next open instead.
  }
  AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    applyPending();
    const endsAt = useAppStore.getState().activeSession?.restEndsAt ?? null;
    if (!endsAt || Date.parse(endsAt) <= Date.now()) end();
  });
}
