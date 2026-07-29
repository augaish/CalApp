import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

/**
 * Supabase client for authentication.
 *
 * Both values are publishable by design — they ship inside mobile apps and are
 * protected by row-level security, not secrecy. The secret/service-role key is
 * never used here and must never reach the app.
 */
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://uvhvxcvwpwkqvnvqdtyf.supabase.co';
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_No3nDw01Bu7U5l2m5k_pnA_zYxl919V';

export const authConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

/**
 * `expo export` prerenders the web build in Node, where `window` — and so the
 * localStorage that AsyncStorage sits on — does not exist. Fall back to memory
 * there; a build has no session worth restoring. React Native defines `window`,
 * so devices always get the real thing.
 */
const runtimeHasWindow = typeof window !== 'undefined';
const memory = new Map<string, string>();

const storage = {
  getItem: (key: string) =>
    runtimeHasWindow ? AsyncStorage.getItem(key) : Promise.resolve(memory.get(key) ?? null),
  setItem: (key: string, value: string) => {
    if (!runtimeHasWindow) {
      memory.set(key, value);
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (!runtimeHasWindow) {
      memory.delete(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

let client: SupabaseClient | null = null;

/**
 * Built on first use rather than at import. Constructing the client starts a
 * session load straight away, and during a prerender there is no browser for
 * that to run in — which is what broke the OTA export.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        // React Native has no URL bar for the OAuth redirect to land in.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
