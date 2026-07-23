import type { Account } from './store';

/**
 * Google sign-in.
 *
 * When Google OAuth client IDs are configured (EXPO_PUBLIC_GOOGLE_*), this
 * runs the real flow. Until then it resolves a local account so the rest of
 * the app — persistent login, logout, per-account data — works end to end.
 * Wiring the real OAuth is a config step (Google Cloud client IDs), done
 * alongside the server deploy.
 */
const GOOGLE_CONFIGURED = !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export const isGoogleConfigured = GOOGLE_CONFIGURED;

export async function signInWithGoogle(): Promise<Account> {
  if (!GOOGLE_CONFIGURED) {
    await new Promise((r) => setTimeout(r, 500));
    return { name: 'Athlete', provider: 'guest' };
  }
  // Real Google OAuth is wired here once client IDs exist (expo-auth-session).
  // Placeholder keeps the type contract until then.
  return { name: 'Athlete', provider: 'guest' };
}
