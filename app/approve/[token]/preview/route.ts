import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDispatchPdfForCycle, type DispatchPdf } from "@/lib/documents/pbdb-pdf";
import { validateToken } from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";

// Inline (in-browser) counterpart of /approve/[token]/download — same token
// check and same `pbdb_pdf` file, streamed back same-origin with an `inline`
// disposition so the shared DocumentViewer (PDF.js) can render it in place
// instead of the browser saving it. Logs `stakeholder.pbdb_previewed` so a
// preview isn't counted as a download in the audit trail.
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

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbPdf.storagePath, 60);

  const upstream = signed?.signedUrl ? await fetch(signed.signedUrl) : null;
  if (!upstream?.ok || !upstream.body) {
    return new NextResponse("Could not retrieve file", { status: 500 });
  }

  await auditLog("stakeholder.pbdb_previewed", null, review.stakeholder_email, {
    projectId: review.project_id,
    metadata: { review_id: review.id, version: pbdbPdf.version },
  });

  const filename = pbdbPdf.originalFilename || "brief.pdf";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
