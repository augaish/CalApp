import i18n from './i18n';
import { trialReminderAt } from './plan-gates';
import { notifications, TRIAL_REMINDER_ID } from './reminders';

/**
 * A notification two days before a store free trial turns into its first
 * charge — the stores don't always say so, and a surprise charge becomes a
 * refund request. Rescheduled on every plan refresh; cancelled when there is
 * no trial. Never asks for permission itself: without it, nothing is sent.
 */
export async function syncTrialReminder(until: string | null): Promise<void> {
  const mod = notifications();
  if (!mod) return;
  try {
    await mod.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID).catch(() => {});
    const at = trialReminderAt(until);
    if (!at || !until) return;
    const allowed = await mod.getPermissionsAsync();
    if (!allowed.granted) return;
    const date = new Date(until).toLocaleDateString(i18n.language === 'ar' ? 'ar' : 'en', { day: 'numeric', month: 'long' });
    await mod.scheduleNotificationAsync({
      identifier: TRIAL_REMINDER_ID,
      content: { title: i18n.t('plans.trialReminderTitle'), body: i18n.t('plans.trialReminderBody', { date }) },
      trigger: { type: mod.SchedulableTriggerInputTypes.DATE, date: at },
    });
  } catch (err) {
    console.warn('trial reminder failed:', err);
  }
}
