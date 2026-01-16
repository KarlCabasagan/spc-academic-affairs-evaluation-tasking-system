import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env.local file."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * A non-persistent Supabase client for operations that should not affect the current session.
 * Uses a custom storage key to avoid "Multiple GoTrueClient instances" warning.
 * Useful for admin operations like creating new users without logging out the admin.
 */
export const supabaseNoPersist = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "sb-temp-auth-token", // Different key to avoid conflict
  },
});
