import { Platform } from 'react-native';

import i18n from './i18n';
import { notifications, REST_ALERT_ID, requestPermission } from './reminders';
import { useAppStore } from './store';

/**
 * The end-of-rest alert.
 *
 * The rest timer is stored as the moment it ends (`activeSession.restEndsAt`),
 * so the app shows the right time whenever it is opened. What was missing was
 * the moment itself when the phone is locked or another app is in front: a
 * local notification scheduled for that end time now covers it. It follows
 * the stored value from anywhere in the app — starting a rest schedules it;
 * skipping, undoing, jumping or finishing clears the value and so cancels it.
 *
 * On screen, the timer finishes itself with a haptic, and the notification
 * handler in reminders.ts keeps the banner out of the way.
 */

const CHANNEL = 'rest-timer';
let channelReady = false;
let askedThisLaunch = false;
let last: string | null | undefined;
// Changes are applied in order: a quick skip-then-log must not let an older
// schedule land after a newer cancel.
let queue: Promise<void> = Promise.resolve();

async function apply(endsAt: string | null, next: string | undefined): Promise<void> {
  const mod = notifications();
  if (!mod) return;
  try {
    await mod.cancelScheduledNotificationAsync(REST_ALERT_ID).catch(() => {});
    if (!endsAt) return;
    const date = new Date(endsAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now() + 1000) return;

    const perm = await mod.getPermissionsAsync();
    if (!perm.granted) {
      // Asked once, the first time a rest starts — the moment it is obviously useful.
      if (askedThisLaunch) return;
      askedThisLaunch = true;
      if (!(await requestPermission(mod))) return;
    }
    if (Platform.OS === 'android' && !channelReady) {
      await mod.setNotificationChannelAsync(CHANNEL, {
        name: i18n.t('session.restChannel'),
        importance: mod.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
      });
      channelReady = true;
    }
    await mod.scheduleNotificationAsync({
      identifier: REST_ALERT_ID,
      content: {
        title: i18n.t('session.restOverTitle'),
        body: next || i18n.t('session.restOverBody'),
        sound: 'default',
        data: { kind: 'rest' },
      },
      trigger: { type: mod.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
    });
  } catch (err) {
    console.warn('rest alert failed:', err);
  }
}

let started = false;

/** Follow the session's rest from now on. Safe to call more than once. */
export function startRestAlerts(): void {
  if (started) return;
  started = true;
  last = useAppStore.getState().activeSession?.restEndsAt ?? null;
  useAppStore.subscribe((s) => {
    const endsAt = s.activeSession?.restEndsAt ?? null;
    if (endsAt === last) return;
    last = endsAt;
    const next = s.activeSession?.restNext;
    queue = queue.then(() => apply(endsAt, next));
  });
}
