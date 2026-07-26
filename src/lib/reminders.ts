import i18n from './i18n';
import {
  isSameDay,
  mealTypesLogged,
  totalsForDay,
  useAppStore,
  workoutStreakDays,
} from './store';
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

// Every notification this module manages — cancelled and rebuilt on each sync.
const MANAGED_IDS = [
  'rem-water-1',
  'rem-water-2',
  'rem-water-3',
  'rem-workout',
  'rem-streak',
  'rem-meal-breakfast',
  'rem-meal-lunch',
  'rem-meal-dinner',
  'rem-macro',
];

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

  for (const id of MANAGED_IDS) await mod.cancelScheduledNotificationAsync(id);
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

  // Water — friendly recurring reminders.
  if (s.remindWater) {
    for (let i = 0; i < WATER_HOURS.length; i++) {
      await daily(`rem-water-${i + 1}`, WATER_HOURS[i], 0, i18n.t('reminders.waterTitle'), i18n.t('reminders.waterBody'));
    }
  }

  // Workout — a nudge at the user's usual training hour, plus a streak saver.
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

  // Meal prompts — only for meals not yet logged today, at their usual time.
  if (s.remindMeals) {
    const logged = mealTypesLogged(s.meals, now);
    for (const type of ['breakfast', 'lunch', 'dinner'] as MealType[]) {
      if (logged.has(type)) continue;
      const t = MEAL_PROMPT[type as 'breakfast' | 'lunch' | 'dinner'];
      const at = todayAt(t.hour, t.minute);
      if (!at) continue;
      await once(
        `rem-meal-${type}`,
        at,
        i18n.t('reminders.mealPromptTitle', { meal: i18n.t(`home.mealTypes.${type}`) }),
        i18n.t('reminders.mealPromptBody'),
      );
    }

    // Evening macro summary — remaining calories / protein for today.
    const macroAt = todayAt(21, 0);
    if (macroAt && s.targets) {
      const totals = totalsForDay(s.meals, now);
      const kcalLeft = Math.round(s.targets.calories - totals.calories);
      const proteinLeft = Math.round(s.targets.proteinG - totals.proteinG);
      const done = kcalLeft <= 0 && proteinLeft <= 0;
      await once(
        'rem-macro',
        macroAt,
        done ? i18n.t('reminders.macroDoneTitle') : i18n.t('reminders.macroTitle'),
        done
          ? i18n.t('reminders.macroDoneBody')
          : i18n.t('reminders.macroBody', {
              kcal: Math.max(0, kcalLeft),
              protein: Math.max(0, proteinLeft),
            }),
      );
    }
  }

  return { granted: true };
}
