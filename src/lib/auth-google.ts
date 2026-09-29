import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { parseAuthCallback } from './auth-callback';
import type { Account } from './store';
import { enabledProviders, getSupabase } from './supabase';

/**
 * Sign in with Google, through Supabase Auth.
 *
 * Google's own page opens in an in-app browser sheet (ASWebAuthenticationSession
 * on iPhone, a Custom Tab on Android); Supabase finishes the handshake with
 * Google and sends the sheet back to `calapp://auth-callback`, which the
 * sheet catches and closes on. The result is the same Supabase session Apple
 * and email sign-in produce, so everything after it is shared.
 *
 * Needs the Google provider switched on in Supabase (a Google Cloud OAuth
 * client) and `calapp://**` in Supabase's redirect allow-list — until then
 * Supabase refuses and the person is told Google isn't available yet.
 */

export class GoogleCancelled extends Error {
  constructor() {
    super('google_cancelled');
    this.name = 'GoogleCancelled';
  }
}

export class GoogleUnavailable extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'GoogleUnavailable';
  }
}

/** Whether to offer the Google button: only once Supabase has it switched on. */
export async function googleSignInEnabled(): Promise<boolean> {
  return (await enabledProviders())?.google === true;
}

export async function signInWithGoogle(): Promise<Account> {
  // Never open the sheet onto Supabase's raw "provider is not enabled" page.
  const providers = await enabledProviders();
  if (providers && providers.google !== true) throw new GoogleUnavailable('provider_not_enabled');
  const redirectTo = Linking.createURL('auth-callback');
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) throw new GoogleUnavailable(error?.message ?? 'no_url');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new GoogleCancelled();

  const back = parseAuthCallback(result.url);
  if (back.kind === 'error') {
    // "provider is not enabled" and friends: a setup gap, not the person's fault.
    if (/not enabled|unsupported provider|redirect/i.test(back.message)) throw new GoogleUnavailable(back.message);
    throw new Error(back.message);
  }
  if (back.kind === 'code') {
    const { error: e } = await sb.auth.exchangeCodeForSession(back.code);
    if (e) throw e;
  } else if (back.kind === 'tokens') {
    const { error: e } = await sb.auth.setSession({ access_token: back.accessToken, refresh_token: back.refreshToken });
    if (e) throw e;
  } else {
    throw new Error('no_session');
  }

  const { data: got } = await sb.auth.getUser();
  const user = got.user;
  if (!user) throw new Error('no_user');
  const meta = user.user_metadata ?? {};
  const email = user.email ?? undefined;
  return {
    name: (meta.full_name as string) || (meta.name as string) || email?.split('@')[0] || 'Athlete',
    email,
    provider: 'google',
  };
}
