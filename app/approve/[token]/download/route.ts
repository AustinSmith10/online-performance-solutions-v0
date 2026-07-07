import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const { data: pbdbPdf } = await supabase
    .from("project_files")
    .select("storage_path, original_filename, version")
    .eq("project_id", review.project_id)
    .eq("file_type", "pbdb_pdf")
    .eq("review_cycle", review.review_cycle)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdbPdf) {
    return new NextResponse("File not found", { status: 404 });
  }

  await auditLog("stakeholder.pbdb_downloaded", null, review.stakeholder_email, {
    projectId: review.project_id,
    metadata: { review_id: review.id, version: pbdbPdf.version },
  });

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbPdf.storage_path as string, 300);

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
