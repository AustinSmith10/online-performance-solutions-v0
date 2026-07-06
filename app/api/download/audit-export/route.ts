import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllAuditEntries, SORT_COLS, type SortCol } from "@/lib/audit/query";
import { auditEntriesToCsv } from "@/lib/audit/csv";
import { auditEntriesToPdf } from "@/lib/audit/pdf";
import { logAuditExport } from "@/lib/audit/export-log";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filters = {
    email: searchParams.get("email") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    event_type: searchParams.get("event_type") ?? undefined,
    org_name: searchParams.get("org_name") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const sortParam = searchParams.get("sort");
  const sortCol: SortCol = SORT_COLS.includes(sortParam as SortCol)
    ? (sortParam as SortCol)
    : "created_at";
  const sortOrder: "asc" | "desc" = searchParams.get("order") === "asc" ? "asc" : "desc";
  const format = searchParams.get("format") === "pdf" ? "pdf" : "csv";

  const supabase = createAdminClient();
  const entries = await fetchAllAuditEntries(supabase, filters, sortCol, sortOrder);
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "pdf") {
    const pdf = await auditEntriesToPdf(entries, "Audit trail");
    const sha256 = await logAuditExport({
      actorId: user.id as string,
      actorEmail: user.email as string,
      format: "pdf",
      content: pdf,
      entryCount: entries.length,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="audit-log-${dateStamp}.pdf"`,
        "X-Content-Sha256": sha256,
      },
    });
  }

  const csv = auditEntriesToCsv(entries);
  const sha256 = await logAuditExport({
    actorId: user.id as string,
    actorEmail: user.email as string,
    format: "csv",
    content: csv,
    entryCount: entries.length,
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${dateStamp}.csv"`,
      "X-Content-Sha256": sha256,
    },
  });
}
