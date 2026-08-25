import i18n from './i18n';
import { isSameDay, useAppStore, workoutStreakDays } from './store';
import type { MealType } from './types';

/**
 * expo-notifications is loaded lazily so an installed binary that predates
 * the native module doesn't crash at import time — reminders simply report
 * "unavailable" until the app is rebuilt.
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

const WATER_HOURS = [10, 15, 20];
const MEAL_PROMPT: Record<'breakfast' | 'lunch' | 'dinner', { hour: number; minute: number }> = {
  breakfast: { hour: 9, minute: 0 },
  lunch: { hour: 13, minute: 30 },
  dinner: { hour: 20, minute: 0 },
};

async function requestPermission(mod: NotificationsModule): Promise<boolean> {
  const settings = await mod.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await mod.requestPermissionsAsync();
  return req.granted;
}

/** Median hour the user usually logs workouts, or 18:00 until there's history. */
function usualWorkoutHour(workouts: { at: string }[]): number {
  const hours = workouts.map((w) => new Date(w.at).getHours()).sort((a, b) => a - b);
  if (hours.length < 3) return 18;
  return hours[Math.floor(hours.length / 2)];
}

/** A Date at hour:minute today, or null if that time has already passed. */
function todayAt(hour: number, minute: number): Date | null {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime() > Date.now() ? d : null;
}

/**
 * Recompute and reschedule all reminders from the current on-device state.
 * Called on first launch, on app foreground, and after each log. Baseline
 * water/workout reminders repeat daily; meal prompts, the streak saver and the
 * macro summary are conditional and only scheduled for today when still due.
 */
export async function syncReminders(): Promise<{ granted: boolean }> {
  const mod = notifications();
  if (!mod) return { granted: false };

  const s = useAppStore.getState();
  const anyOn = s.remindMeals || s.remindWater || s.remindWorkouts;

  // Wipe every scheduled local notification (this module is the only thing
  // in the app that schedules any) rather than cancelling by a fixed ID list
  // — a toggle switched off must never leave a stray notification still
  // firing, including any left over from an older identifier scheme.
  await mod.cancelAllScheduledNotificationsAsync();
  if (!anyOn) return { granted: true };
  if (!(await requestPermission(mod))) return { granted: false };

  const daily = (id: string, hour: number, minute: number, title: string, body: string) =>
    mod.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: { type: mod.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  const once = (id: string, date: Date, title: string, body: string) =>
    mod.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: { type: mod.SchedulableTriggerInputTypes.DATE, date },
    });

  const now = new Date();

  // Water — recurring; fires daily even if the app is never opened.
  if (s.remindWater) {
    for (let i = 0; i < WATER_HOURS.length; i++) {
      await daily(`rem-water-${i + 1}`, WATER_HOURS[i], 0, i18n.t('reminders.waterTitle'), i18n.t('reminders.waterBody'));
    }
  }

  // Workout — recurring nudge at the user's usual training hour, plus a
  // conditional streak saver (only meaningful when a streak is live).
  if (s.remindWorkouts) {
    const hour = usualWorkoutHour(s.workouts);
    await daily('rem-workout', hour, 0, i18n.t('reminders.workoutTitle'), i18n.t('reminders.workoutBody'));

    const streak = workoutStreakDays(s.workouts);
    const trainedToday = s.workouts.some((w) => isSameDay(w.at, now));
    const streakAt = todayAt(20, 30);
    if (streak >= 2 && !trainedToday && streakAt) {
      await once('rem-streak', streakAt, i18n.t('reminders.streakTitle'), i18n.t('reminders.streakBody', { count: streak }));
    }
  }

  // Meal prompts + evening check-in — recurring so they fire without the app
  // being opened. Copy reads fine whether or not the meal was already logged.
  if (s.remindMeals) {
    for (const type of ['breakfast', 'lunch', 'dinner'] as MealType[]) {
      const time = MEAL_PROMPT[type as 'breakfast' | 'lunch' | 'dinner'];
      await daily(
        `rem-meal-${type}`,
        time.hour,
        time.minute,
        i18n.t('reminders.mealPromptTitle', { meal: i18n.t(`home.mealTypes.${type}`) }),
        i18n.t('reminders.mealPromptBody'),
      );
    }
    await daily('rem-macro', 21, 0, i18n.t('reminders.macroTitle'), i18n.t('reminders.eveningBody'));
  }

  return { granted: true };
}
