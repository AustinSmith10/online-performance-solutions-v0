import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveLocalSupabaseEnv } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Admin (service-role) client pointed at the local Supabase instance this
 * suite is allowed to touch (see env.ts's safety check). Used only from
 * test setup/teardown/assertions — never imported by application code.
 */
export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const { url, serviceRoleKey } = resolveLocalSupabaseEnv();
  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
