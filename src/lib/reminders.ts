import * as Notifications from 'expo-notifications';

import i18n from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const MEAL_IDS = ['reminder-breakfast', 'reminder-lunch', 'reminder-dinner'];
const WATER_IDS = ['reminder-water-1', 'reminder-water-2', 'reminder-water-3'];

const MEAL_SCHEDULE: { id: string; key: string; hour: number; minute: number }[] = [
  { id: MEAL_IDS[0], key: 'breakfast', hour: 8, minute: 30 },
  { id: MEAL_IDS[1], key: 'lunch', hour: 13, minute: 0 },
  { id: MEAL_IDS[2], key: 'dinner', hour: 19, minute: 30 },
];

const WATER_HOURS = [10, 15, 20];

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

export async function setMealReminders(enabled: boolean): Promise<boolean> {
  for (const id of MEAL_IDS) await Notifications.cancelScheduledNotificationAsync(id);
  if (!enabled) return true;
  if (!(await requestNotificationPermission())) return false;
  for (const meal of MEAL_SCHEDULE) {
    await Notifications.scheduleNotificationAsync({
      identifier: meal.id,
      content: {
        title: i18n.t(`reminders.${meal.key}Title`),
        body: i18n.t(`reminders.${meal.key}Body`),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: meal.hour,
        minute: meal.minute,
      },
    });
  }
  return true;
}

export async function setWaterReminders(enabled: boolean): Promise<boolean> {
  for (const id of WATER_IDS) await Notifications.cancelScheduledNotificationAsync(id);
  if (!enabled) return true;
  if (!(await requestNotificationPermission())) return false;
  for (let i = 0; i < WATER_HOURS.length; i++) {
    await Notifications.scheduleNotificationAsync({
      identifier: WATER_IDS[i],
      content: {
        title: i18n.t('reminders.waterTitle'),
        body: i18n.t('reminders.waterBody'),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: WATER_HOURS[i],
        minute: 0,
      },
    });
  }
  return true;
}
