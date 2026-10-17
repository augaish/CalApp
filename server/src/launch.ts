import { getSetting, grantToEveryoneWithoutPlan, setSetting, setUserPlan } from './db.js';
import { findAuthUserByEmail } from './supabase-admin.js';

/**
 * The launch switch, run once at start-up (16 Oct 2026). Plan locks go on
 * while Apple reviews (Guideline 2.5.19: what is reviewed is what launches);
 * the owner had no access to the admin page, so the server does it:
 *  - every account that exists now (testers, the owner, sample installs) gets
 *    Pro for 90 days, so nobody who tested is locked out, including Android
 *    testers whose app can't buy;
 *  - App Review's demo account gets Pro for a year;
 *  - plan locks on.
 * A marker setting makes it happen once; the admin toggle works as before.
 */
const MARKER = 'launch_switch_2026_10';
const REVIEW_EMAIL = 'review@calgym.org';

export async function runLaunchSwitch(): Promise<void> {
  const done = await getSetting<{ at?: string }>(MARKER, {});
  if (done.at) return;
  const now = Date.now();
  const testers = await grantToEveryoneWithoutPlan('pro', new Date(now + 90 * 86400000).toISOString(), 'Pre-launch tester (plan locks on)');
  const review = await findAuthUserByEmail(REVIEW_EMAIL);
  if (review && typeof review === 'object') {
    await setUserPlan(review.id, 'pro', 'admin', new Date(now + 365 * 86400000).toISOString(), 'App Review demo account');
  }
  await setSetting('plan_locks', { on: true });
  await setSetting(MARKER, { at: new Date(now).toISOString(), testers, review: typeof review === 'object' && review ? review.id : String(review) });
  console.log(`launch switch: plan locks on; ${testers} accounts given Pro for 90 days; review account ${typeof review === 'object' && review ? 'given Pro for a year' : `not found (${String(review)})`}`);
}
