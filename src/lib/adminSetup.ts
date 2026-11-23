import { supabase } from "./supabase";

/**
 * Check whether an administrator account exists.
 * Uses `has_admin` RPC when available, falling back to `get_user_count` on
 * pre-migration databases. Throws on network/backend failure so callers fail closed.
 */
export async function checkHasAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_admin");

  if (!error) {
    return Boolean(data);
  }

  // Fallback for databases before the 2026-01-24 migration
  if (error.code === "PGRST202") {
    const { data: countData, error: countError } =
      await supabase.rpc("get_user_count");
    if (countError) throw countError;
    return (countData ?? 0) > 0;
  }

  throw error;
}
