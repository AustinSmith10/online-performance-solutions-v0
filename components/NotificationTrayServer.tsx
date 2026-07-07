import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNeedsAttentionSignals } from "@/lib/admin/needs-attention";
import {
  sortEntries,
  notificationToEntry,
  failedJobToEntry,
  bounceEventToEntry,
  stalledProjectToEntry,
  pendingReviewToEntry,
  expiringTokenToEntry,
  type TrayEntry,
} from "@/lib/notifications/tray";
import { NotificationTray } from "./NotificationTray";
import type { Notification } from "@/lib/notifications/types";

export async function NotificationTrayServer({
  projectBasePath,
  align,
  includeNeedsAttention = false,
}: {
  projectBasePath: string;
  align?: "left" | "right";
  includeNeedsAttention?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const entries: TrayEntry[] = ((data ?? []) as Notification[]).map((n) =>
    notificationToEntry(n, projectBasePath)
  );

  if (includeNeedsAttention) {
    const { data: signals } = await getNeedsAttentionSignals(createAdminClient());
    entries.push(
      ...signals.failedJobs.map((j) => failedJobToEntry(j, projectBasePath)),
      ...signals.bounceEvents.map((b) => bounceEventToEntry(b, projectBasePath)),
      ...signals.stalledProjects.map((p) => stalledProjectToEntry(p, projectBasePath)),
      ...signals.pendingReviews.map((r) => pendingReviewToEntry(r, projectBasePath)),
      ...signals.expiringTokens.map((r) => expiringTokenToEntry(r, projectBasePath))
    );
  }

  return (
    <NotificationTray
      initialEntries={sortEntries(entries)}
      projectBasePath={projectBasePath}
      userId={user.id}
      includeNeedsAttention={includeNeedsAttention}
      align={align}
    />
  );
}
