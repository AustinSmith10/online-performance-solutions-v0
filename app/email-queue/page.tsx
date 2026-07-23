import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

// Kept as a stable link target (digest email, bookmarks) now that the queue
// itself lives inside each role's normal shell — see
// app/(admin)/admin/email-queue and app/(consultant)/ops/email-queue.
export default async function EmailQueueRedirect() {
  const user = await requireRole("super_admin", "admin", "consultant");
  redirect(user.role === "consultant" ? "/ops/email-queue" : "/admin/email-queue");
}
