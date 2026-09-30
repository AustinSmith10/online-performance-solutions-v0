import { cache } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getNeedsAttentionSignalsForRequest } from "@/lib/admin/needs-attention";
import {
  sortEntries,
  notificationToEntry,
  failedJobToEntry,
  bounceEventToEntry,
  stalledProjectToEntry,
  pendingReviewToEntry,
  expiringTokenToEntry,
  overdueAssignmentToEntry,
  type TrayEntry,
} from "@/lib/notifications/tray";
import { NotificationTray } from "./NotificationTray";
import type { Notification } from "@/lib/notifications/types";

type TrayData = { userId: string; entries: TrayEntry[] } | null;

// The admin layout renders the tray twice (mobile bar + desktop sidebar).
// React's cache() makes the second call in the same request reuse the first
// one's result instead of repeating the notifications query and the whole
// needs-attention query.
const loadTrayData = cache(async (projectBasePath: string, includeNeedsAttention: boolean): Promise<TrayData> => {
  const profile = await getSessionUser();
  if (!profile) return null;
  const userId = profile.id as string;

  const supabase = await createClient();
  const [{ data }, signals] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    includeNeedsAttention ? getNeedsAttentionSignalsForRequest() : Promise.resolve(null),
  ]);

  const entries: TrayEntry[] = ((data ?? []) as Notification[]).map((n) =>
    notificationToEntry(n, projectBasePath)
  );

  if (signals) {
    const s = signals.data;
    entries.push(
      ...s.failedJobs.map((j) => failedJobToEntry(j, projectBasePath)),
      ...s.bounceEvents.map((b) => bounceEventToEntry(b, projectBasePath)),
      ...s.stalledProjects.map((p) => stalledProjectToEntry(p, projectBasePath)),
      ...s.pendingReviews.map((r) => pendingReviewToEntry(r, projectBasePath)),
      ...s.expiringTokens.map((r) => expiringTokenToEntry(r, projectBasePath)),
      ...s.overdueAssignments.map((p) => overdueAssignmentToEntry(p, projectBasePath))
    );
  }

  return { userId, entries: sortEntries(entries) };
});

export async function NotificationTrayServer({
  projectBasePath,
  align,
  includeNeedsAttention = false,
}: {
  projectBasePath: string;
  align?: "left" | "right";
  includeNeedsAttention?: boolean;
}) {
  const tray = await loadTrayData(projectBasePath, includeNeedsAttention);
  if (!tray) return null;

  return (
    <NotificationTray
      initialEntries={tray.entries}
      projectBasePath={projectBasePath}
      userId={tray.userId}
      includeNeedsAttention={includeNeedsAttention}
      align={align}
    />
  );
}
