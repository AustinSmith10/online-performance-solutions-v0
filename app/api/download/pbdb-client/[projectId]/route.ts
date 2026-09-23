import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDispatchPdfForCycle, type DispatchPdf } from "@/lib/documents/pbdb-pdf";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { getStakeholderReviewedProjectIds, stakeholderAccessFilter } from "@/lib/portal/access";

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

  // Cached PDF, or regenerated from the cycle's source docx on a cache miss
  // (#186) — never 404 just because the pbdb_pdf row is missing.
  let pbdbPdf: DispatchPdf | null;
  try {
    pbdbPdf = await getDispatchPdfForCycle(supabase, projectId, project.review_cycle as number);
  } catch (err) {
    console.error("[pbdb-pdf] on-demand render failed:", err);
    return new NextResponse("Could not prepare the document", { status: 500 });
  }

  if (!pbdbPdf) return new NextResponse("File not found", { status: 404 });

  await auditLog("project.pbdb_downloaded", user.id as string, user.email as string, {
    projectId,
    orgId: user.client_id as string,
    metadata: { version: pbdbPdf.version, filename: pbdbPdf.originalFilename },
  });

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbPdf.storagePath, 300, {
      download: pbdbPdf.originalFilename || true,
    });

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
