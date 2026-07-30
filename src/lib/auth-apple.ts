import { Platform } from 'react-native';

import type { Account } from './store';
import { getSupabase } from './supabase';

/**
 * Sign in with Apple.
 *
 * The native module only exists in a binary that was built with it, so it is
 * loaded lazily and every failure resolves to "unavailable". That matters
 * because JavaScript ships over the air onto whatever binary is already
 * installed: importing the module at the top level would crash the app the
 * moment this file loaded on an older build. Instead the button simply does not
 * appear until the next native release.
 */

type AppleModule = typeof import('expo-apple-authentication');

let cached: AppleModule | null | undefined;

function appleModule(): AppleModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-apple-authentication') as AppleModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** True only where the button should actually be offered. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const m = appleModule();
  if (!m) return false;
  try {
    return await m.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Apple hands over the user's name only on the very first authorization, so it
 * is taken when offered and derived from the email on later sign-ins.
 */
export async function signInWithApple(): Promise<Account> {
  const m = appleModule();
  if (!m) throw new Error('apple_unavailable');

  const credential = await m.signInAsync({
    requestedScopes: [m.AppleAuthenticationScope.FULL_NAME, m.AppleAuthenticationScope.EMAIL],
  });
  const token = credential.identityToken;
  if (!token) throw new Error('no_identity_token');

  const { data, error } = await getSupabase().auth.signInWithIdToken({
    provider: 'apple',
    token,
  });
  if (error) throw error;

  const user = data.user;
  const appleName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const email = user?.email ?? credential.email ?? undefined;
  return {
    name: appleName || (user?.user_metadata?.name as string) || email?.split('@')[0] || 'Athlete',
    email,
    provider: 'apple',
  };
}
