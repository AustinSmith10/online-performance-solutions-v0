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

  const { data: pbdbFile } = await supabase
    .from("project_files")
    .select("storage_path, original_filename, version")
    .eq("project_id", review.project_id)
    .eq("file_type", "pbdb")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdbFile) {
    return new NextResponse("File not found", { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbFile.storage_path as string, 300);

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  await auditLog("stakeholder.pbdb_downloaded", null, review.stakeholder_email, {
    projectId: review.project_id,
    metadata: {
      review_id: review.id,
      version: pbdbFile.version,
    },
  });

  return NextResponse.redirect(signed.signedUrl);
}
