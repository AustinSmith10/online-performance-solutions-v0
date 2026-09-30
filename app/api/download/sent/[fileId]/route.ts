import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { resolveSentPdf } from "@/lib/documents/sent-pdf";

/**
 * "Download PDF (as sent)" (#208): the stored bytes of the PBDB/PBDR PDF that
 * went to stakeholders, never a re-render. Admin, super admin and the
 * project's assigned consultant only. Issues a short-lived signed URL and
 * redirects to it, so the bytes come straight from storage untouched; every
 * download is audit-logged.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  const user = await getSessionUser();
  if (!user || (user.role !== "consultant" && user.role !== "admin" && user.role !== "super_admin")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const sent = await resolveSentPdf(supabase, fileId);
  if (!sent) return new NextResponse("Not found", { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("assigned_consultant_id, client_id")
    .eq("id", sent.projectId)
    .maybeSingle();
  if (!project) return new NextResponse("Not found", { status: 404 });

  if (user.role === "consultant" && project.assigned_consultant_id !== user.id) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { data: signed, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(sent.storagePath, 60, { download: sent.originalFilename });
  if (error || !signed) return new NextResponse("Could not retrieve file", { status: 500 });

  await auditLog("project.sent_pdf_downloaded", user.id as string, user.email as string, {
    projectId: sent.projectId,
    orgId: project.client_id as string | undefined,
    metadata: {
      file_id: fileId,
      doc_type: sent.docType,
      filename: sent.originalFilename,
      role: user.role,
    },
  });

  return NextResponse.redirect(signed.signedUrl, 302);
}
