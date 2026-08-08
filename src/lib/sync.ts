import { useAppStore } from './store';
import { getSupabase } from './supabase';
import type {
  DailyTargets,
  Exercise,
  LoggedMeal,
  LoggedWorkout,
  Profile,
  WeightEntry,
} from './types';
import type { WaterEntry } from './store';

/**
 * Cloud backup of the user's own logs.
 *
 * This is backup and restore, not live multi-device sync. The account holds one
 * snapshot and the most recent write wins, which covers what people actually
 * mean by signing in — "my history follows me to a new phone" — without the
 * per-record timestamps and deletion tombstones that genuine concurrent editing
 * would need. Two phones logging at the same time will not merge; the later
 * save is the one that survives.
 *
 * Photos stay on the device that took them. Only the numbers travel, so a
 * restored meal keeps its macros but not its picture.
 */

const TABLE = 'user_data';

export interface Snapshot {
  v: 1;
  profile: Profile | null;
  targets: DailyTargets | null;
  meals: LoggedMeal[];
  exercises: Exercise[];
  schedule: ReturnType<typeof useAppStore.getState>['schedule'];
  skips: Record<string, string[]>;
  dayOrder: Record<string, string[]>;
  workouts: LoggedWorkout[];
  water: WaterEntry[];
  weights: WeightEntry[];
}

/** The syncable slice: logs and profile, never device-local preferences. */
export function snapshot(): Snapshot {
  const s = useAppStore.getState();
  return {
    v: 1,
    profile: s.profile,
    targets: s.targets,
    meals: s.meals,
    exercises: s.exercises,
    schedule: s.schedule,
    skips: s.skips,
    dayOrder: s.dayOrder,
    workouts: s.workouts,
    water: s.water,
    weights: s.weights,
  };
}

/** Nothing worth keeping — used to tell a fresh install from a real history. */
function isEmpty(snap: Snapshot): boolean {
  return (
    !snap.profile &&
    snap.meals.length === 0 &&
    snap.workouts.length === 0 &&
    snap.weights.length === 0 &&
    snap.water.length === 0 &&
    snap.exercises.length === 0
  );
}

/** Guards against the store subscription firing on our own restore. */
let applying = false;

async function currentUid(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

async function fetchRemote(): Promise<{ data: Snapshot; updatedAt: string } | null> {
  const uid = await currentUid();
  if (!uid) return null;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data?.data) return null;
  return { data: data.data as Snapshot, updatedAt: data.updated_at as string };
}

/** Write this device's logs to the account. */
export async function pushSnapshot(): Promise<boolean> {
  const uid = await currentUid();
  if (!uid) return false;
  const now = new Date().toISOString();
  const { error } = await getSupabase()
    .from(TABLE)
    .upsert({ user_id: uid, data: snapshot(), updated_at: now }, { onConflict: 'user_id' });
  if (error) {
    console.warn('backup failed:', error.message);
    return false;
  }
  useAppStore.getState().setSyncedAt(now);
  return true;
}

function apply(snap: Snapshot, updatedAt: string) {
  applying = true;
  try {
    useAppStore.getState().applySnapshot({
      profile: snap.profile ?? null,
      targets: snap.targets ?? null,
      meals: snap.meals ?? [],
      exercises: snap.exercises ?? [],
      schedule: snap.schedule ?? {},
      skips: snap.skips ?? {},
      dayOrder: snap.dayOrder ?? {},
      workouts: snap.workouts ?? [],
      water: snap.water ?? [],
      weights: snap.weights ?? [],
    });
    useAppStore.getState().setSyncedAt(updatedAt);
  } finally {
    applying = false;
  }
}

/**
 * First sign-in on a device. An account that already holds logs is being
 * restored onto this phone; an empty one adopts whatever the guest built up
 * here. Returns what happened so the UI can say so.
 */
export async function reconcileOnSignIn(): Promise<'restored' | 'uploaded' | 'none'> {
  const remote = await fetchRemote();
  if (remote && !isEmpty(remote.data)) {
    apply(remote.data, remote.updatedAt);
    return 'restored';
  }
  if (!isEmpty(snapshot())) {
    return (await pushSnapshot()) ? 'uploaded' : 'none';
  }
  return 'none';
}

/**
 * Launch reconciliation for an already-signed-in device: take the account's
 * copy when it is newer than what we last agreed on (another phone wrote it),
 * otherwise publish ours.
 */
export async function syncOnLaunch(): Promise<void> {
  if (!(await currentUid())) return;
  const remote = await fetchRemote();
  const localSyncedAt = useAppStore.getState().syncedAt;
  if (remote && (!localSyncedAt || remote.updatedAt > localSyncedAt)) {
    apply(remote.data, remote.updatedAt);
    return;
  }
  await pushSnapshot();
}

/**
 * Keep the account's copy current as the user logs things. Debounced so a
 * burst of set-logging is one upload, and skipped while we are the ones
 * writing to the store.
 */
let timer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

export function startBackupWatcher(): void {
  if (watching) return;
  watching = true;
  let previous = snapshot();
  useAppStore.subscribe(() => {
    if (applying) return;
    const next = snapshot();
    // Only upload when the synced slice actually moved — unrelated state
    // (the day being viewed, a dismissed card) must not cost a round trip.
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    previous = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void pushSnapshot();
    }, 4000);
  });
}

/** Remove the account's stored copy (called as part of deleting the account). */
export async function deleteRemoteData(): Promise<void> {
  const uid = await currentUid();
  if (!uid) return;
  await getSupabase().from(TABLE).delete().eq('user_id', uid);
}
