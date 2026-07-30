import { linkInstall, setInstallId } from './api';
import type { Account } from './store';
import { useAppStore } from './store';
import { getSupabase } from './supabase';
import { reconcileOnSignIn, startBackupWatcher, syncOnLaunch } from './sync';

export { authConfigured } from './supabase';

/**
 * Email sign-in via a 6-digit one-time code. Chosen over magic links because a
 * code can be typed back into the app without depending on deep links working
 * from every mail client.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Verify the emailed code and return the signed-in account. */
export async function verifyEmailCode(email: string, code: string): Promise<Account> {
  const { data, error } = await getSupabase().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error('no_user');
  return {
    name: (user.user_metadata?.name as string) ?? email.split('@')[0],
    email: user.email ?? email,
    provider: 'email',
  };
}

/**
 * Point usage metering at the signed-in user so the plan follows the person
 * across devices instead of the install. Called after sign-in and on launch.
 */
export async function syncAuthIdentity(): Promise<'restored' | 'uploaded' | 'none'> {
  const { data } = await getSupabase().auth.getSession();
  const uid = data.session?.user.id;
  const store = useAppStore.getState();
  const deviceId = store.ensureInstallId();
  if (!uid) {
    setInstallId(deviceId);
    return 'none';
  }
  setInstallId(uid);
  // The first time this account is seen here, give it what the install already
  // used and owns — otherwise signing in would silently refill the month's
  // allowance. Retried on the next launch if the call does not get through.
  const firstTimeHere = store.linkedRef !== uid;
  if (firstTimeHere && (await linkInstall(deviceId))) {
    useAppStore.getState().setLinkedRef(uid);
  }
  // Logs follow the person too: restore the account's history onto a new phone,
  // or adopt this phone's guest history into an empty account.
  const outcome = firstTimeHere ? await reconcileOnSignIn() : 'none';
  if (!firstTimeHere) await syncOnLaunch();
  startBackupWatcher();
  return outcome;
}

export async function signOutAuth(): Promise<void> {
  try {
    await getSupabase().auth.signOut();
  } catch {
    // Already signed out or offline — the local account is cleared regardless.
  }
  // Fall back to the anonymous install id so the app keeps working as a guest.
  setInstallId(useAppStore.getState().ensureInstallId());
}
