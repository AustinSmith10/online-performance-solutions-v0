import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { stripRedTokenColor } from "@/lib/documents/color-strip";

const PBDB_VISIBLE_STATUSES = [
  "dispatched", "revision_required", "converting", "delivered", "complete",
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const user = await getSessionUser();
  if (!user || user.role !== "client") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const [{ data: project }, { data: pbdbFile }] = await Promise.all([
    supabase
      .from("projects")
      .select("org_id, status, strip_token_color")
      .eq("id", projectId)
      .eq("org_id", user.org_id as string)
      .in("status", PBDB_VISIBLE_STATUSES)
      .maybeSingle(),
    supabase
      .from("project_files")
      .select("storage_path, original_filename, version")
      .eq("project_id", projectId)
      .eq("file_type", "pbdb")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!project) return new NextResponse("Not found", { status: 404 });
  if (!pbdbFile) return new NextResponse("File not found", { status: 404 });

  await auditLog("project.pbdb_downloaded", user.id as string, user.email as string, {
    projectId,
    orgId: user.org_id as string,
    metadata: { version: pbdbFile.version, filename: pbdbFile.original_filename },
  });

  if (project.strip_token_color) {
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
