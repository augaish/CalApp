import { SERVER_URL } from './api';
import { useAppStore } from './store';

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
  if (ref) {
    try {
      const res = await fetch(`${SERVER_URL}/api/me`, {
        method: 'DELETE',
        headers: { 'x-calgym-user': ref },
      });
      serverOk = res.ok;
    } catch {
      serverOk = false;
    }
  }
  useAppStore.getState().resetAll();
  return serverOk;
}
