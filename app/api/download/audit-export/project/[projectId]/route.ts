import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllAuditEntries } from "@/lib/audit/query";
import { auditEntriesToCsv } from "@/lib/audit/csv";
import { auditEntriesToPdf } from "@/lib/audit/pdf";
import { logAuditExport } from "@/lib/audit/export-log";
import { PROJECT_AUDIT_EXCLUDED_EVENTS } from "@/lib/audit/project-scope";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const user = await getSessionUser();
  if (!user || (user.role !== "consultant" && user.role !== "admin" && user.role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  if (user.role === "consultant") {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("assigned_consultant_id", user.id as string)
      .maybeSingle();

    if (!project) return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "pdf" ? "pdf" : "csv";

  const entries = await fetchAllAuditEntries(
    supabase,
    { project_id: projectId, excluded_event_types: PROJECT_AUDIT_EXCLUDED_EVENTS },
    "created_at",
    "asc"
  );

  if (format === "pdf") {
    const pdf = await auditEntriesToPdf(entries, `Audit trail — project ${projectId}`);
    const sha256 = await logAuditExport({
      actorId: user.id as string,
      actorEmail: user.email as string,
      projectId,
      format: "pdf",
      content: pdf,
      entryCount: entries.length,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="audit-log-project-${projectId}.pdf"`,
        "X-Content-Sha256": sha256,
      },
    });
  }

  const csv = auditEntriesToCsv(entries);
  const sha256 = await logAuditExport({
    actorId: user.id as string,
    actorEmail: user.email as string,
    projectId,
    format: "csv",
    content: csv,
    entryCount: entries.length,
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-project-${projectId}.csv"`,
      "X-Content-Sha256": sha256,
    },
  });
}
