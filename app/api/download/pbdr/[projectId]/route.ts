import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

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

  // Verify the project belongs to the user's org and is in a delivered state
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .eq("org_id", user.org_id as string)
    .in("status", ["delivered", "complete"])
    .maybeSingle();

  if (!project) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: pbdrFile } = await supabase
    .from("project_files")
    .select("storage_path, original_filename")
    .eq("project_id", projectId)
    .eq("file_type", "pbdr")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdrFile) {
    return new NextResponse("File not found", { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdrFile.storage_path as string, 300);

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  await auditLog("project.pbdr_downloaded", user.id as string, user.email as string, {
    projectId,
    orgId: user.org_id as string,
    metadata: { filename: pbdrFile.original_filename },
  });

  return NextResponse.redirect(signed.signedUrl);
}
