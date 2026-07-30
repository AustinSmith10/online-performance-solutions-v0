import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  const user = await getSessionUser();
  if (!user || (user.role !== "consultant" && user.role !== "super_admin" && user.role !== "admin")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: file } = await supabase
    .from("project_files")
    .select("id, project_id, storage_path, original_filename, version")
    .eq("id", fileId)
    .eq("file_type", "pbdb")
    .maybeSingle();

  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Consultants must be assigned to the project
  if (user.role === "consultant") {
    const { data: project } = await supabase
      .from("projects")
      .select("assigned_consultant_id, client_id")
      .eq("id", file.project_id as string)
      .maybeSingle();

    if (!project || project.assigned_consultant_id !== user.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const { data: project } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", file.project_id as string)
    .maybeSingle();

  const { data: blob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(file.storage_path as string);

  if (downloadError || !blob) {
    return new NextResponse("Could not retrieve file", { status: 500 });
  }

  await auditLog("project.pbdb_downloaded", user.id as string, user.email as string, {
    projectId: file.project_id as string,
    orgId: project?.client_id as string | undefined,
    metadata: {
      file_id: file.id,
      version: file.version,
      filename: file.original_filename,
      role: user.role,
    },
  });

  const { error: downloadedAtError } = await supabase
    .from("projects")
    .update({ pbdb_downloaded_at: new Date().toISOString() })
    .eq("id", file.project_id as string)
    .is("pbdb_downloaded_at", null);

  if (downloadedAtError) {
    console.error(
      `[pbdb-download] Failed to set pbdb_downloaded_at for project ${file.project_id as string}:`,
      downloadedAtError
    );
  }

  const filename = (file.original_filename as string) || "pbdb.pdf";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
