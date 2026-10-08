import { isNewerStamp } from './day';
import { useAppStore } from './store';
import { getSupabase } from './supabase';
import type {
  DailyTargets,
  Exercise,
  LoggedMeal,
  LoggedWorkout,
  Profile,
  Program,
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
  dayExtras?: Record<string, string[]>;
  workouts: LoggedWorkout[];
  water: WaterEntry[];
  weights: WeightEntry[];
  activeProgram: Program | null;
  // Plans the person made, not only what they logged. Added later: a backup
  // written before them simply lacks these, and restoring it then leaves the
  // phone's own copies alone rather than emptying them.
  savedSchedules?: State['savedSchedules'];
  activeScheduleId?: State['activeScheduleId'];
  occurrences?: State['occurrences'];
  recipes?: State['recipes'];
  mealPlanRecipes?: State['mealPlanRecipes'];
  mealPlanSwaps?: State['mealPlanSwaps'];
  shopping?: State['shopping'];
  fastingHistory?: State['fastingHistory'];
  favoriteIds?: State['favoriteIds'];
  /** Answers given before a program build, allergies included. */
  planPrefs?: State['planPrefs'];
  exerciseNotes?: State['exerciseNotes'];
}

type State = ReturnType<typeof useAppStore.getState>;

/** The syncable slice: logs, plans and profile, never device-local preferences. */
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
    dayExtras: s.dayExtras,
    workouts: s.workouts,
    water: s.water,
    weights: s.weights,
    activeProgram: s.activeProgram,
    savedSchedules: s.savedSchedules,
    activeScheduleId: s.activeScheduleId,
    occurrences: s.occurrences,
    recipes: s.recipes,
    mealPlanRecipes: s.mealPlanRecipes,
    mealPlanSwaps: s.mealPlanSwaps,
    shopping: s.shopping,
    fastingHistory: s.fastingHistory,
    favoriteIds: s.favoriteIds,
    planPrefs: s.planPrefs,
    exerciseNotes: s.exerciseNotes,
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
    snap.exercises.length === 0 &&
    !(snap.savedSchedules?.length) &&
    !(snap.recipes?.length)
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
      dayExtras: snap.dayExtras ?? {},
      workouts: snap.workouts ?? [],
      water: snap.water ?? [],
      weights: snap.weights ?? [],
      activeProgram: snap.activeProgram ?? null,
      savedSchedules: snap.savedSchedules,
      activeScheduleId: snap.activeScheduleId,
      occurrences: snap.occurrences,
      recipes: snap.recipes,
      mealPlanRecipes: snap.mealPlanRecipes,
      mealPlanSwaps: snap.mealPlanSwaps,
      shopping: snap.shopping,
      fastingHistory: snap.fastingHistory,
      favoriteIds: snap.favoriteIds,
      planPrefs: snap.planPrefs,
      exerciseNotes: snap.exerciseNotes,
    });
    useAppStore.getState().setSyncedAt(updatedAt);
  } finally {
    applying = false;
  }
}

/**
 * First sign-in on a device. An account that already holds logs is being
 * restored onto this phone; an empty one adopts whatever a guest built up
 * here — but never logs that belong to another account (someone logged out
 * and a different person signed in): those are cleared instead, so one
 * person's history can't be copied into another's account.
 */
export async function reconcileOnSignIn(uid: string): Promise<'restored' | 'uploaded' | 'none'> {
  const remote = await fetchRemote();
  if (remote && !isEmpty(remote.data)) {
    apply(remote.data, remote.updatedAt);
    return 'restored';
  }
  const owner = useAppStore.getState().dataOwner;
  if (owner && owner !== uid) {
    withoutBackup(() => useAppStore.getState().clearPersonal({ keepAccount: true }));
    return 'none';
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
  if (remote && isNewerStamp(remote.updatedAt, localSyncedAt)) {
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

/** Change the store without it counting as the person's edit to back up. */
export function withoutBackup(fn: () => void): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}

/**
 * Upload anything not yet backed up, now (before logging out). True when the
 * account's copy is current, or there is no account to back up to.
 */
export async function flushBackup(): Promise<boolean> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!(await currentUid())) return true;
  return pushSnapshot();
}

/** Remove the account's stored copy (called as part of deleting the account). */
export async function deleteRemoteData(): Promise<void> {
  const uid = await currentUid();
  if (!uid) return;
  await getSupabase().from(TABLE).delete().eq('user_id', uid);
}
