import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDispatchPdfForCycle, type DispatchPdf } from "@/lib/documents/pbdb-pdf";
import { validateToken } from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const result = await validateToken(token);
  if (!result || result.isExpired) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { review } = result;
  const supabase = createAdminClient();

  // Cached PDF, or regenerated from the cycle's source docx on a cache miss
  // (#186) — never 404 just because the pbdb_pdf row is missing.
  let pbdbPdf: DispatchPdf | null;
  try {
    pbdbPdf = await getDispatchPdfForCycle(supabase, review.project_id, review.review_cycle);
  } catch (err) {
    console.error("[pbdb-pdf] on-demand render failed:", err);
    return new NextResponse("Could not prepare the document", { status: 500 });
  }

  if (!pbdbPdf) {
    return new NextResponse("File not found", { status: 404 });
  }

  await auditLog("stakeholder.pbdb_downloaded", null, review.stakeholder_email, {
    projectId: review.project_id,
    metadata: { review_id: review.id, version: pbdbPdf.version },
  });

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbPdf.storagePath, 300);

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
