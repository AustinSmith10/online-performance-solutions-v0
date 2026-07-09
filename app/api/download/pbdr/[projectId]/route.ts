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
  const allowedRoles = ["stakeholder", "consultant", "admin", "super_admin"];
  if (!user || !allowedRoles.includes(user.role as string)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  // Verify the requester is allowed to see this project: an internal stakeholder
  // scoped to their org on a delivered/complete project, the consultant assigned
  // to it (any status, once a PBDR exists — they may want to sanity check their
  // own QA work before it's officially delivered), or an admin/super_admin who
  // can see any project.
  let project: { id: string; client_id?: string } | null = null;
  if (user.role === "consultant") {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("assigned_consultant_id", user.id as string)
      .maybeSingle();
    project = data;
  } else if (user.role === "stakeholder") {
    const { data } = await supabase
      .from("projects")
      .select("id, client_id")
      .eq("id", projectId)
      .eq("client_id", user.client_id as string)
      .in("status", ["delivered", "complete"])
      .maybeSingle();
    project = data;
  } else {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    project = data;
  }

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
    .createSignedUrl(pbdrFile.storage_path as string, 300, {
      download: (pbdrFile.original_filename as string) || true,
    });

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  await auditLog("project.pbdr_downloaded", user.id as string, user.email as string, {
    projectId,
    orgId: (user.client_id as string | null) ?? undefined,
    metadata: { filename: pbdrFile.original_filename, role: user.role },
  });

  return NextResponse.redirect(signed.signedUrl);
}
