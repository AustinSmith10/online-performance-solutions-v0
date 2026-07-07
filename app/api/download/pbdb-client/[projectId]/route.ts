import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

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

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, status, review_cycle")
    .eq("id", projectId)
    .eq("client_id", user.client_id as string)
    .in("status", PBDB_VISIBLE_STATUSES)
    .maybeSingle();

  if (!project) return new NextResponse("Not found", { status: 404 });

  const { data: pbdbPdf } = await supabase
    .from("project_files")
    .select("storage_path, original_filename, version")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb_pdf")
    .eq("review_cycle", project.review_cycle as number)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdbPdf) return new NextResponse("File not found", { status: 404 });

  await auditLog("project.pbdb_downloaded", user.id as string, user.email as string, {
    projectId,
    orgId: user.client_id as string,
    metadata: { version: pbdbPdf.version, filename: pbdbPdf.original_filename },
  });

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdbPdf.storage_path as string, 300, {
      download: (pbdbPdf.original_filename as string) || true,
    });

  if (!signed?.signedUrl) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
