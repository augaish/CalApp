import i18n from './i18n';

/**
 * expo-notifications is loaded lazily so an installed binary that predates
 * the native module doesn't crash at import time — reminder toggles simply
 * report "unavailable" until the app is rebuilt.
 */
type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

const MEAL_IDS = ['reminder-breakfast', 'reminder-lunch', 'reminder-dinner'];
const WATER_IDS = ['reminder-water-1', 'reminder-water-2', 'reminder-water-3'];

const MEAL_SCHEDULE: { id: string; key: string; hour: number; minute: number }[] = [
  { id: MEAL_IDS[0], key: 'breakfast', hour: 8, minute: 30 },
  { id: MEAL_IDS[1], key: 'lunch', hour: 13, minute: 0 },
  { id: MEAL_IDS[2], key: 'dinner', hour: 19, minute: 30 },
];

const WATER_HOURS = [10, 15, 20];

async function requestPermission(mod: NotificationsModule): Promise<boolean> {
  const settings = await mod.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await mod.requestPermissionsAsync();
  return req.granted;
}

export async function setMealReminders(enabled: boolean): Promise<boolean> {
  const mod = notifications();
  if (!mod) return !enabled;
  for (const id of MEAL_IDS) await mod.cancelScheduledNotificationAsync(id);
  if (!enabled) return true;
  if (!(await requestPermission(mod))) return false;
  for (const meal of MEAL_SCHEDULE) {
    await mod.scheduleNotificationAsync({
      identifier: meal.id,
      content: {
        title: i18n.t(`reminders.${meal.key}Title`),
        body: i18n.t(`reminders.${meal.key}Body`),
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.DAILY,
        hour: meal.hour,
        minute: meal.minute,
      },
    });
  }
  return true;
}

export async function setWaterReminders(enabled: boolean): Promise<boolean> {
  const mod = notifications();
  if (!mod) return !enabled;
  for (const id of WATER_IDS) await mod.cancelScheduledNotificationAsync(id);
  if (!enabled) return true;
  if (!(await requestPermission(mod))) return false;
  for (let i = 0; i < WATER_HOURS.length; i++) {
    await mod.scheduleNotificationAsync({
      identifier: WATER_IDS[i],
      content: {
        title: i18n.t('reminders.waterTitle'),
        body: i18n.t('reminders.waterBody'),
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.DAILY,
        hour: WATER_HOURS[i],
        minute: 0,
      },
    });
  }
  return true;
}
