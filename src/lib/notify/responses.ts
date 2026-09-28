import type { Href } from 'expo-router';
import { router } from 'expo-router';

import { dayExerciseIds } from '../day-plan';
import { notifications, syncReminders } from '../reminders';
import { useAppStore } from '../store';
import { responseStep, withSnooze } from './actions';
import { usualGlass } from './facts';

/**
 * Carrying out what the person did with a notification: a tap opens the
 * screen it is about, "+250 ml" logs the glass, "Later" moves the reminder,
 * "Start workout" starts today's workout. Then everything is re-planned, so
 * the next water message already counts the glass.
 *
 * The same press can reach the app twice (the live listener and, on
 * Android, the background task; or the "last response" at launch), so each
 * is recorded and done once.
 */

interface ResponseLike {
  actionIdentifier: string;
  notification: { date: number; request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}

const seen = new Set<string>();

/** Resolves once the saved data has loaded (immediately in a running app). */
export function whenHydrated(): Promise<void> {
  if (useAppStore.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useAppStore.subscribe((s) => {
      if (!s.hydrated) return;
      unsub();
      resolve();
    });
  });
}

function go(path: string) {
  // At a cold start the navigator mounts a moment after the first render.
  setTimeout(() => {
    try {
      router.push(path as Href);
    } catch (err) {
      console.warn('notification route failed:', path, err);
    }
  }, 350);
}

function startWorkout(): string {
  const s = useAppStore.getState();
  if (s.activeSession) return '/session';
  const today = new Date();
  const plan = dayExerciseIds(s, today);
  if (plan.ids.length === 0) return '/training';
  s.startSession(today, plan.ids);
  return useAppStore.getState().activeSession ? '/session' : '/training';
}

/**
 * Do what the response asks. `canNavigate` is false in a background task
 * (Android), where there is no screen — only the background buttons arrive there.
 */
export async function handleResponse(response: ResponseLike, canNavigate: boolean): Promise<void> {
  const request = response.notification.request;
  const key = `${request.identifier}|${response.actionIdentifier}|${response.notification.date}`;
  if (seen.has(key)) return;
  seen.add(key);
  await whenHydrated();
  const s = useAppStore.getState();
  if ((s.notifyHandled ?? []).includes(key)) return;
  s.markNotifyHandled(key);

  const kind = typeof request.content.data?.kind === 'string' ? request.content.data.kind : undefined;
  const glass = usualGlass(Array.isArray(s.water) ? s.water : []);
  const step = responseStep(kind, response.actionIdentifier, glass);
  const mod = notifications();

  switch (step.type) {
    case 'water':
      s.logWater(step.ml);
      break;
    case 'snooze': {
      const now = new Date();
      s.setNotifySnooze(withSnooze(s.notifySnooze, request.identifier, new Date(now.getTime() + step.minutes * 60_000), now));
      break;
    }
    case 'startWorkout':
      if (canNavigate) go(startWorkout());
      break;
    case 'route':
      if (canNavigate) go(step.path);
      break;
    case 'none':
      break;
  }
  if (step.type === 'water' || step.type === 'snooze') {
    // Done from the notification itself: clear it, and re-plan around it.
    await mod?.dismissNotificationAsync(request.identifier).catch(() => {});
    await syncReminders();
  }
}

let started = false;

/** Listen for taps and buttons from now on, and act on the one that opened the app. */
export function startNotificationResponses(): void {
  const mod = notifications();
  if (started || !mod) return;
  started = true;
  mod.addNotificationResponseReceivedListener((r) => void handleResponse(r, true));
  mod
    .getLastNotificationResponseAsync()
    .then((r) => {
      if (r) void handleResponse(r, true);
    })
    .catch(() => {});
}
