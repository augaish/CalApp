import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
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

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no URL bar for the OAuth redirect to land in.
    detectSessionInUrl: false,
  },
});
