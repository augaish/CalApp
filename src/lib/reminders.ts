import { AppState, Platform } from 'react-native';

import { renderNote } from './notify/copy';
import { buildFacts } from './notify/facts';
import { planNotes, type Channel, type PlannedNote } from './notify/planner';
import i18n from './i18n';
import type { GateState } from './plan-gates';
import { useAppStore } from './store';

/**
 * Notifications, planned from the person's own data (see notify/planner.ts):
 * re-planned after every log and on every open, so a reminder for something
 * already done disappears, and every message carries today's real numbers.
 *
 * expo-notifications is loaded lazily so an installed binary that predates
 * the native module doesn't crash at import time — reminders simply report
 * "unavailable" until the app is rebuilt.
 */
type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/** The notifications module, or null where it is unavailable (web, old binaries). */
export function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  // The web build has no scheduling API; every caller already treats null as "not available".
  if (Platform.OS === 'web') return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async (n) => {
        // The rest alert is for when the app is out of sight. On screen, the
        // timer itself finishes (with a haptic), so a banner would be noise.
        const inApp = n.request.content.data?.kind === 'rest' && AppState.currentState === 'active';
        return {
          shouldShowBanner: !inApp,
          shouldShowList: !inApp,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      },
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

/** The rest timer's end-of-rest alert; reminders never cancel it. */
export const REST_ALERT_ID = 'calgym-rest';
/** The reminder before a store trial's first charge (trial-reminder.ts); reminders never cancel it. */
export const TRIAL_REMINDER_ID = 'calgym-trial';

export async function requestPermission(mod: NotificationsModule): Promise<boolean> {
  const settings = await mod.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await mod.requestPermissionsAsync();
  return req.granted;
}

/** The OS permission as it stands — read only, never prompts. `null` when notifications are not available on this platform. */
export async function notificationsGranted(): Promise<boolean | null> {
  const mod = notifications();
  if (!mod) return null;
  try {
    const settings = await mod.getPermissionsAsync();
    return !!settings.granted;
  } catch {
    return null;
  }
}

/** What the plan covers (Essentials module, no plan…), supplied by the entitlement store. */
let gateSource: () => GateState = () => ({});
export function setNotifyGateSource(fn: () => GateState): void {
  gateSource = fn;
}

/** The plan as it stands now, rendered — for Settings' "Coming up" preview. */
export function plannedPreview(now: Date = new Date()): { id: string; at: Date; channel: Channel; title: string; body: string }[] {
  try {
    const notes = planNotes(buildFacts(useAppStore.getState(), gateSource(), now));
    return notes.map((n) => ({ id: n.id, at: n.at, channel: n.channel, ...renderNote(n, i18n.t.bind(i18n), i18n.language) }));
  } catch {
    return [];
  }
}

/** One Android channel per switch, so each can also be tuned in system settings. */
const CHANNELS: Channel[] = ['food', 'water', 'training', 'progress'];
let channelsLang: string | null = null;

async function ensureChannels(mod: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android' || channelsLang === i18n.language) return;
  for (const c of CHANNELS) {
    await mod.setNotificationChannelAsync(`calgym-${c}`, {
      name: i18n.t(`notifications.channel.${c}`),
      // Default importance: on the lock screen and with a sound, but never a
      // full-screen interruption. Recaps are gentler still.
      importance: c === 'progress' ? mod.AndroidImportance.LOW : mod.AndroidImportance.DEFAULT,
      sound: c === 'progress' ? null : 'default',
    });
  }
  channelsLang = i18n.language;
}

async function schedule(mod: NotificationsModule, note: PlannedNote): Promise<void> {
  const { title, body } = renderNote(note, i18n.t.bind(i18n), i18n.language);
  const quiet = note.kind === 'weekRecap' || note.kind === 'comeback' || note.kind === 'restDay';
  await mod.scheduleNotificationAsync({
    identifier: note.id,
    content: {
      title,
      body,
      data: { kind: note.kind, channel: note.channel },
      // iPhone: recaps and gentle notes arrive without lighting the screen;
      // a fast ending is worth breaking through Focus for.
      interruptionLevel: quiet ? 'passive' : note.kind === 'fastEnd' ? 'timeSensitive' : 'active',
      sound: quiet ? undefined : 'default',
    },
    trigger: {
      type: mod.SchedulableTriggerInputTypes.DATE,
      date: note.at,
      ...(Platform.OS === 'android' ? { channelId: `calgym-${note.channel}` } : {}),
    },
  });
}

async function runSync(): Promise<{ granted: boolean }> {
  const mod = notifications();
  if (!mod) return { granted: false };
  const s = useAppStore.getState();
  const enabled = s.notifyPrefs?.enabled !== false;
  const anyOn = enabled && (s.remindMeals || s.remindWater || s.remindWorkouts);

  // Everything planned is re-planned from scratch: a switch turned off, or a
  // reminder whose reason has gone (lunch logged), must never still fire.
  // The rest timer and the trial reminder belong to other features.
  const scheduled = await mod.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier !== REST_ALERT_ID && n.identifier !== TRIAL_REMINDER_ID)
      .map((n) => mod.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!anyOn) return { granted: true };
  if (!(await requestPermission(mod))) return { granted: false };

  await ensureChannels(mod);
  const notes = planNotes(buildFacts(s, gateSource(), new Date()));
  for (const note of notes) {
    try {
      await schedule(mod, note);
    } catch (err) {
      console.warn('notification schedule failed:', note.id, err);
    }
  }
  return { granted: true };
}

// One sync at a time, and a burst of logs collapses into one re-plan.
let running: Promise<{ granted: boolean }> | null = null;
let again = false;

/**
 * Re-plan and reschedule every notification from the current data. Called
 * after logs, on foreground, when the plan changes and from Settings.
 */
export async function syncReminders(): Promise<{ granted: boolean }> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let result = await runSync();
    while (again) {
      again = false;
      result = await runSync();
    }
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}
