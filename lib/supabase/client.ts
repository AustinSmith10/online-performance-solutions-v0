import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Module-level singleton. Every "use client" component that needs Supabase
// calls createClient(), and several are mounted simultaneously per layout
// (NotificationTray x2, NotificationToasts, RealtimeRefresh, ...). A bare
// factory here means each of those gets its own GoTrueClient with its own
// autoRefreshToken timer, all racing to refresh the same session — Supabase
// refresh tokens are single-use/rotating, so only the first request in the
// race succeeds and the rest fail with "Invalid Refresh Token: Refresh Token
// Not Found". Returning one shared client (and one shared realtime socket)
// removes the race entirely.
let client: SupabaseClient | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
