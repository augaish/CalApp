/**
 * When the membership sheet may offer itself, unasked. Gentle by design:
 *
 * - once, right after a new person finishes onboarding (and its tour);
 * - then at most once a week, from the third day on;
 * - only to someone on the free plan, only when the store actually has a plan
 *   to sell, and never over a workout or while they are elsewhere than a tab.
 *
 * With the launch offer (plan locks on, no free plan), someone without a plan
 * can only look back at their records, so the offer comes daily instead and
 * without the three-day wait — still never over a workout.
 *
 * Hitting a limit opens the sheet directly and is not counted here.
 */

export interface MembershipPromptState {
  /** When this device first ran the check — the "day 3" clock starts here. */
  firstSeenAt: string;
  /** The after-onboarding showing has happened (or was never due). */
  introShown: boolean;
  lastShownAt: string | null;
}

const DAY = 86_400_000;
export const FIRST_WEEKLY_AFTER_DAYS = 3;
export const WEEKLY_GAP_DAYS = 7;
export const LAUNCH_GAP_DAYS = 1;

/**
 * The state to start from. Someone still before the tour is new, and is owed
 * the after-onboarding showing; someone already past it has been using the
 * app, so their clock simply starts now.
 */
export function initialPromptState(tourSeen: boolean, now: Date = new Date()): MembershipPromptState {
  return { firstSeenAt: now.toISOString(), introShown: tourSeen, lastShownAt: null };
}

export function promptDue(
  state: MembershipPromptState,
  ctx: { free: boolean; tourDone: boolean; busy: boolean; launchOffer?: boolean },
  now: Date = new Date(),
): 'intro' | 'weekly' | null {
  if (!ctx.free || !ctx.tourDone || ctx.busy) return null;
  if (!state.introShown) return 'intro';
  const since = (iso: string) => (now.getTime() - new Date(iso).getTime()) / DAY;
  if (!ctx.launchOffer && since(state.firstSeenAt) < FIRST_WEEKLY_AFTER_DAYS) return null;
  const gap = ctx.launchOffer ? LAUNCH_GAP_DAYS : WEEKLY_GAP_DAYS;
  if (state.lastShownAt && since(state.lastShownAt) < gap) return null;
  return 'weekly';
}

export function markShown(state: MembershipPromptState, now: Date = new Date()): MembershipPromptState {
  return { ...state, introShown: true, lastShownAt: now.toISOString() };
}
