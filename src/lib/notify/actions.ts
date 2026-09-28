import type { NoteKind } from './planner';
import type { Translate } from './copy';
import { formatNumber } from './copy';

/**
 * What a notification can do besides being read: its buttons, and where a
 * tap on it goes. Pure (the translator is passed in) so the mapping is
 * tested directly; notify/responses.ts carries it out.
 *
 * Buttons that finish the job without the app (+250 ml, Later) run in the
 * background; the ones that need a screen (Log meal, Start workout) open it.
 */

export type CategoryId = 'calgym-water' | 'calgym-meal' | 'calgym-protein' | 'calgym-training' | 'calgym-missed';

export type ActionId = 'water-add' | 'log-food' | 'snooze-30' | 'snooze-60' | 'start-workout';

export interface CategoryAction {
  identifier: ActionId;
  buttonTitle: string;
  opensAppToForeground: boolean;
}

/** The buttons a message of this kind carries, if any. */
export function categoryFor(kind: NoteKind | string | undefined): CategoryId | null {
  switch (kind) {
    case 'water':
    case 'waterAfterWorkout':
      return 'calgym-water';
    case 'meal':
      return 'calgym-meal';
    case 'protein':
      return 'calgym-protein';
    case 'training':
      return 'calgym-training';
    case 'missed':
      return 'calgym-missed';
    default:
      return null;
  }
}

/** Every category with its buttons, worded now (the water button shows their usual glass). */
export function categories(t: Translate, glassMl: number, lang: string): { id: CategoryId; actions: CategoryAction[] }[] {
  const glass = glassMl > 0 ? glassMl : 250;
  return [
    { id: 'calgym-water', actions: [{ identifier: 'water-add', buttonTitle: t('notify.action.addWater', { ml: formatNumber(glass, lang) }), opensAppToForeground: false }] },
    {
      id: 'calgym-meal',
      actions: [
        { identifier: 'log-food', buttonTitle: t('notify.action.logMeal'), opensAppToForeground: true },
        { identifier: 'snooze-30', buttonTitle: t('notify.action.in30'), opensAppToForeground: false },
      ],
    },
    { id: 'calgym-protein', actions: [{ identifier: 'log-food', buttonTitle: t('notify.action.logFood'), opensAppToForeground: true }] },
    {
      id: 'calgym-training',
      actions: [
        { identifier: 'start-workout', buttonTitle: t('notify.action.startWorkout'), opensAppToForeground: true },
        { identifier: 'snooze-60', buttonTitle: t('notify.action.in60'), opensAppToForeground: false },
      ],
    },
    { id: 'calgym-missed', actions: [{ identifier: 'start-workout', buttonTitle: t('notify.action.startNow'), opensAppToForeground: true }] },
  ];
}

export type ResponseStep =
  | { type: 'route'; path: string }
  | { type: 'water'; ml: number }
  | { type: 'snooze'; minutes: number }
  | { type: 'startWorkout' }
  | { type: 'none' };

/** Where a plain tap on a message of this kind goes. */
export function routeFor(kind: string | undefined): string | null {
  switch (kind) {
    case 'meal':
    case 'protein':
    case 'fastEnd':
      return '/food';
    case 'water':
    case 'waterAfterWorkout':
      return '/water';
    case 'training':
    case 'missed':
    case 'restDay':
    case 'program':
      return '/training';
    case 'rest':
      return '/session';
    case 'trial':
      return '/upgrade';
    case 'dayRecap':
    case 'weekRecap':
    case 'comeback':
      return '/';
    default:
      return null;
  }
}

/** What answering a message with `action` (a button, or a plain tap) should do. */
export function responseStep(kind: string | undefined, action: string, glassMl: number): ResponseStep {
  switch (action) {
    case 'water-add':
      return { type: 'water', ml: glassMl > 0 ? glassMl : 250 };
    case 'snooze-30':
      return { type: 'snooze', minutes: 30 };
    case 'snooze-60':
      return { type: 'snooze', minutes: 60 };
    case 'log-food':
      return { type: 'route', path: '/add-menu' };
    case 'start-workout':
      return { type: 'startWorkout' };
    default: {
      const path = routeFor(kind);
      return path ? { type: 'route', path } : { type: 'none' };
    }
  }
}

/** Snoozes still ahead, with the one just asked for — old ones dropped so the list stays small. */
export function withSnooze(current: Record<string, string> | undefined, id: string, until: Date, now: Date): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(current ?? {})) {
    if (Date.parse(v) > now.getTime()) next[k] = v;
  }
  next[id] = until.toISOString();
  return next;
}
