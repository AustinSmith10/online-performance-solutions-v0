import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken } from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";
import { stripRedTokenColor } from "@/lib/documents/color-strip";

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

  const [{ data: pbdbFile }, { data: project }] = await Promise.all([
    supabase
      .from("project_files")
      .select("storage_path, original_filename, version")
      .eq("project_id", review.project_id)
      .eq("file_type", "pbdb")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("strip_token_color")
      .eq("id", review.project_id)
      .maybeSingle(),
  ]);

  if (!pbdbFile) {
    return new NextResponse("File not found", { status: 404 });
  }

  await auditLog("stakeholder.pbdb_downloaded", null, review.stakeholder_email, {
    projectId: review.project_id,
    metadata: { review_id: review.id, version: pbdbFile.version },
  });

  if (project?.strip_token_color) {
    const { data: blob } = await supabase.storage
      .from("documents")
      .download(pbdbFile.storage_path as string);
    if (!blob) return new NextResponse("Could not download file", { status: 500 });
    const stripped = stripRedTokenColor(Buffer.from(await blob.arrayBuffer()));
    return new NextResponse(new Uint8Array(stripped), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${pbdbFile.original_filename as string}"`,
      },
    });
  }

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbFile.storage_path as string, 300);

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
