import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by the nav badges (admin sidebar, consultant top-bar) and the
// available-requests digest job (#101) so "pending" is counted the same way
// everywhere — approved/rejected entries never count.
export async function getPendingEmailQueueCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("inbound_email_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    console.error("[queue-pending-count] query failed:", error);
    return 0;
  }

  return count ?? 0;
}
