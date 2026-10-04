import { SERVER_URL } from './api';
import { signOutAuth } from './auth';
import { useAppStore } from './store';
import { getSupabase } from './supabase';
import { deleteRemoteData, flushBackup, withoutBackup } from './sync';

/**
 * Everything the app holds about the user, as a portable JSON document.
 * Used by Profile → Export my data (a store requirement, and simply good
 * practice: the data is theirs).
 */
export function buildExport(): string {
  const s = useAppStore.getState();
  return JSON.stringify(
    {
      app: 'Calgym',
      exportedAt: new Date().toISOString(),
      profile: s.profile,
      targets: s.targets,
      meals: s.meals,
      workouts: s.workouts,
      exercises: s.exercises,
      schedule: s.schedule,
      water: s.water,
      weights: s.weights,
      recipes: s.recipes,
      mealPlanRecipes: s.mealPlanRecipes,
      mealPlanSwaps: s.mealPlanSwaps,
      savedSchedules: s.savedSchedules,
      occurrences: s.occurrences,
      activeProgram: s.activeProgram,
      planPrefs: s.planPrefs,
      fastingHistory: s.fastingHistory,
      shopping: s.shopping,
    },
    null,
    2,
  );
}

/**
 * Delete the account: remove the server-side usage/plan records, then wipe the
 * device. Returns false if the server call failed, so the caller can warn
 * rather than silently leaving data behind.
 */
export async function deleteAccount(): Promise<boolean> {
  const ref = useAppStore.getState().installId;
  let serverOk = true;
  // Read before anything is signed out: the server needs it to delete the
  // sign-in account itself, not only the records attached to it.
  let token: string | null = null;
  try {
    token = (await getSupabase().auth.getSession()).data.session?.access_token ?? null;
  } catch {
    token = null;
  }
  // The cloud backup goes first: wiping the device while a copy of the same
  // logs sits in the account would not be a deletion at all.
  try {
    await deleteRemoteData();
  } catch {
    serverOk = false;
  }
  if (ref) {
    try {
      const res = await fetch(`${SERVER_URL}/api/me`, {
        method: 'DELETE',
        headers: { 'x-calgym-user': ref, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      serverOk = res.ok && serverOk;
    } catch {
      serverOk = false;
    }
  }
  await signOutAuth();
  useAppStore.getState().resetAll();
  return serverOk;
}

/**
 * Log out of this phone. The account's copy is brought up to date first, then
 * its logs, plans and coach history are removed from the phone — they come
 * back when that account signs in again — so the next person to sign in here
 * starts clean and never inherits (or uploads) someone else's history.
 *
 * 'unsaved' means the last changes could not be backed up (usually offline):
 * nothing was changed, and the caller asks before calling again with force.
 */
export async function logOut(force = false): Promise<'done' | 'unsaved'> {
  if (!force && !(await flushBackup())) return 'unsaved';
  await signOutAuth();
  withoutBackup(() => useAppStore.getState().clearPersonal());
  return 'done';
}
