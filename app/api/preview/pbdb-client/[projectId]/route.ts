import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { getStakeholderReviewedProjectIds, stakeholderAccessFilter } from "@/lib/portal/access";

// Inline (in-browser) counterpart of /api/download/pbdb-client — same access
// rules and same `pbdb_pdf` file, but streamed back same-origin with an
// `inline` disposition so the shared DocumentViewer (PDF.js) can render it in
// place instead of the browser saving it. Logs a distinct
// `stakeholder.pbdb_previewed` event so a preview isn't mistaken for a
// download in the audit trail. Bytes are piped straight from a short-lived
// signed URL (same approach as /api/download/pbdb/[fileId]).
const PBDB_VISIBLE_STATUSES = [
  "dispatched", "revision_required", "converting", "delivered", "complete",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const user = await getSessionUser();
  if (!user || user.role !== "stakeholder") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const reviewedProjectIds = await getStakeholderReviewedProjectIds(supabase, user.email as string);
  const { data: project } = await supabase
    .from("projects")
    .select("client_id, status, review_cycle")
    .eq("id", projectId)
    .eq("client_id", user.client_id as string)
    .in("status", PBDB_VISIBLE_STATUSES)
    .or(stakeholderAccessFilter(user.id as string, reviewedProjectIds))
    .maybeSingle();

  if (!project) return new NextResponse("Not found", { status: 404 });

  const { data: pbdbPdf } = await supabase
    .from("project_files")
    .select("storage_path, original_filename, version")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb_pdf")
    .eq("review_cycle", project.review_cycle as number)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdbPdf) return new NextResponse("File not found", { status: 404 });

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbPdf.storage_path as string, 60);

  const upstream = signed?.signedUrl ? await fetch(signed.signedUrl) : null;
  if (!upstream?.ok || !upstream.body) {
    return new NextResponse("Could not retrieve file", { status: 500 });
  }

  await auditLog("stakeholder.pbdb_previewed", user.id as string, user.email as string, {
    projectId,
    orgId: user.client_id as string,
    metadata: { version: pbdbPdf.version, filename: pbdbPdf.original_filename },
  });

  const filename = (pbdbPdf.original_filename as string) || "brief.pdf";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
