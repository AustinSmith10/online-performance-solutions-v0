import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Lightweight poll target for projects.progress_pct — written by
 * generatePbdb, deliverPbdr, and buildPbdrPreview at real pipeline
 * boundaries (see lib/documents/progress.ts). hooks/useProjectProgress.ts
 * polls this while a Generate/Regenerate/Convert/Preview is in flight.
 *
 * A plain GET route rather than a server action (#184): the client runs
 * server actions one at a time, so a poll action queued behind the
 * triggering mutation and its revalidation never observed progress going
 * back to null — the button spun until a full page refresh.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || !["consultant", "super_admin", "admin"].includes(user.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const { id: projectId } = await params;
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("progress_pct")
    .eq("id", projectId)
    .is("deleted_at", null);
  if (user.role === "consultant") {
    query = query.eq("assigned_consultant_id", user.id);
  }
  const { data } = await query.maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(
    { progressPct: (data.progress_pct as number | null) ?? null },
    { headers: NO_STORE }
  );
}
