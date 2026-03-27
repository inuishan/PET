import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getPublicEnv, type PublicEnv } from './env';
import { secureStoreStorage } from './secure-store-storage';

let supabaseClient: SupabaseClient | null = null;

export function createSupabaseClient(env: PublicEnv = getPublicEnv()) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: secureStoreStorage,
    },
  });
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient();
  }

  return supabaseClient;
}
