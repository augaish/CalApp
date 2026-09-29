import i18n from './i18n';
import { notifications, WELCOME_NUDGE_ID } from './reminders';
import { useAppStore } from './store';

/**
 * What the welcome moment after a purchase says, per plan — and the one
 * notification that follows it the next morning.
 */

export type WelcomeTier = 'essentials' | 'pro' | 'proPlus';
export type WelcomeFocus = 'food' | 'training' | 'both';

export interface WelcomeContent {
  /** i18n keys: the plan pill, the lead line and three things it unlocks. */
  planKey: string;
  leadKey: string;
  rows: { icon: 'camera' | 'barbell' | 'sparkles' | 'restaurant' | 'trophy' | 'body' | 'cart' | 'document-text'; key: string }[];
}

/** A trial includes everything in Pro, so it lists Pro's highlights whatever the plan after it. */
export function welcomeContent(tier: WelcomeTier, focus: WelcomeFocus, trial: boolean): WelcomeContent {
  const planKey = tier === 'proPlus' ? 'plans.name.proPlus' : tier === 'pro' ? 'plans.name.pro' : `plans.name.essentials_${focus === 'food' ? 'food' : 'training'}`;
  if (trial || tier === 'pro') {
    return {
      planKey,
      leadKey: trial ? 'planWelcome.leadTrial' : 'planWelcome.leadPro',
      rows: [
        { icon: 'camera', key: 'planWelcome.row.snap' },
        { icon: 'barbell', key: 'planWelcome.row.train' },
        { icon: 'sparkles', key: 'planWelcome.row.coach' },
      ],
    };
  }
  if (tier === 'proPlus') {
    return {
      planKey,
      leadKey: 'planWelcome.leadProPlus',
      rows: [
        { icon: 'camera', key: 'planWelcome.row.accuracy' },
        { icon: 'document-text', key: 'planWelcome.row.memory' },
        { icon: 'sparkles', key: 'planWelcome.row.coach' },
      ],
    };
  }
  return focus === 'food'
    ? {
        planKey,
        leadKey: 'planWelcome.leadFood',
        rows: [
          { icon: 'camera', key: 'planWelcome.row.snap' },
          { icon: 'restaurant', key: 'planWelcome.row.recipes' },
          { icon: 'body', key: 'planWelcome.row.health' },
        ],
      }
    : {
        planKey,
        leadKey: 'planWelcome.leadTraining',
        rows: [
          { icon: 'barbell', key: 'planWelcome.row.train' },
          { icon: 'trophy', key: 'planWelcome.row.records' },
          { icon: 'body', key: 'planWelcome.row.health' },
        ],
      };
}

/** How many motivational lines there are (planWelcome.motto.0 …). */
export const MOTTO_COUNT = 5;

/** 9:00 tomorrow, local time. */
export function nextMorning(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * "Day 1 of Pro — start with your first scan" at 9:00 the next morning. Only
 * when notifications are allowed and switched on in the app; never asks for
 * permission itself.
 */
export async function scheduleWelcomeNudge(tier: WelcomeTier, focus: WelcomeFocus, trial: boolean): Promise<void> {
  const mod = notifications();
  if (!mod) return;
  try {
    if (useAppStore.getState().notifyPrefs?.enabled === false) return;
    const allowed = await mod.getPermissionsAsync();
    if (!allowed.granted) return;
    const which = trial || tier !== 'essentials' ? 'pro' : focus === 'food' ? 'food' : 'training';
    const plan = i18n.t(welcomeContent(tier, focus, trial).planKey);
    await mod.cancelScheduledNotificationAsync(WELCOME_NUDGE_ID).catch(() => {});
    await mod.scheduleNotificationAsync({
      identifier: WELCOME_NUDGE_ID,
      content: {
        title: i18n.t('planWelcome.nudgeTitle', { plan }),
        body: i18n.t(`planWelcome.nudge.${which}`),
        data: { kind: which === 'training' ? 'training' : 'meal' },
      },
      trigger: { type: mod.SchedulableTriggerInputTypes.DATE, date: nextMorning() },
    });
  } catch (err) {
    console.warn('welcome nudge failed:', err);
  }
}
