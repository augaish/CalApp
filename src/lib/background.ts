import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { useEntitlement } from './entitlement';
import { deviceLanguage, setI18nLanguage } from './i18n';
import { handleResponse, whenHydrated } from './notify/responses';
import { notifications, syncReminders } from './reminders';
import { useAppStore } from './store';

/**
 * Work the app does with no screen, defined at startup (index.ts) as the
 * task manager requires:
 *
 *  - a notification button pressed while the app is closed (Android runs it
 *    here; iOS wakes the app itself, and notify/responses.ts handles it);
 *  - a background refresh every few hours, so the plan stays true on days
 *    the app isn't opened — tomorrow's reminders get today's real numbers,
 *    and a new day starts with its own plan.
 *
 * Only on a binary that carries these modules; older builds (reached by an
 * over-the-air update) simply go without.
 */

type TaskManagerModule = typeof import('expo-task-manager');
type BackgroundTaskModule = typeof import('expo-background-task');

const TaskManager: TaskManagerModule | null =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoTaskManager') != null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-task-manager') as TaskManagerModule)
    : null;
const BackgroundTask: BackgroundTaskModule | null =
  TaskManager && requireOptionalNativeModule('ExpoBackgroundTask') != null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-background-task') as BackgroundTaskModule)
    : null;

export const NOTIFY_ACTION_TASK = 'calgym-notification-action';
export const REFRESH_TASK = 'calgym-refresh';

/** The saved data and the person's language, before anything is worded. */
async function prepare(): Promise<void> {
  await whenHydrated();
  setI18nLanguage(useAppStore.getState().language ?? deviceLanguage());
}

if (TaskManager) {
  TaskManager.defineTask(NOTIFY_ACTION_TASK, async ({ data }) => {
    try {
      if (data && typeof data === 'object' && 'actionIdentifier' in data) {
        await prepare();
        await handleResponse(data as Parameters<typeof handleResponse>[0], false);
      }
    } catch (err) {
      console.warn('notification action task failed:', err);
    }
  });

  TaskManager.defineTask(REFRESH_TASK, async () => {
    try {
      await prepare();
      // What the plan covers decides which messages exist; a failed check
      // leaves the last known plan in place.
      await useEntitlement.getState().refresh().catch(() => {});
      await syncReminders();
      return BackgroundTask?.BackgroundTaskResult.Success;
    } catch (err) {
      console.warn('background refresh failed:', err);
      return BackgroundTask?.BackgroundTaskResult.Failed;
    }
  });
}

let registered = false;

/** Register the background work once the app is up. Safe to call more than once. */
export async function registerBackgroundWork(): Promise<void> {
  if (registered || !TaskManager) return;
  registered = true;
  try {
    if (Platform.OS === 'android') await notifications()?.registerTaskAsync(NOTIFY_ACTION_TASK);
  } catch (err) {
    console.warn('notification task registration failed:', err);
  }
  try {
    if (BackgroundTask && !(await TaskManager.isTaskRegisteredAsync(REFRESH_TASK))) {
      await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: 180 });
    }
  } catch (err) {
    console.warn('background refresh registration failed:', err);
  }
}
