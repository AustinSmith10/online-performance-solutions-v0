import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DownloadPbdrLink } from "../_components/DownloadPbdrLink";
import type { ProjectStatus } from "@/types";

type DeliveredProject = {
  id: string;
  po_number: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  created_at: string;
  delivered_at: string | null;
  expected_delivery_date: string | null;
};

type PbdrFile = {
  project_id: string;
  original_filename: string | null;
  version: number;
};

function formatAuDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ClientHistoryPage() {
  const user = await requireRole("stakeholder");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, po_number, extracted_fields, status, created_at, delivered_at, expected_delivery_date")
    .eq("client_id", user.client_id as string)
    .in("status", ["delivered", "complete"])
    .order("created_at", { ascending: false });

  const reports = (data ?? []) as DeliveredProject[];

  // Determine which projects have a PBDR available, and its original filename
  const projectIds = reports.map((r) => r.id);
  const projectsWithPbdr = new Set<string>();
  const pbdrFilenameMap = new Map<string, string>();

  if (projectIds.length > 0) {
    const { data: pbdrFiles } = await supabase
      .from("project_files")
      .select("project_id, original_filename, version")
      .in("project_id", projectIds)
      .eq("file_type", "pbdr")
      .order("version", { ascending: false });

    for (const f of (pbdrFiles ?? []) as PbdrFile[]) {
      projectsWithPbdr.add(f.project_id);
      if (!pbdrFilenameMap.has(f.project_id) && f.original_filename) {
        pbdrFilenameMap.set(f.project_id, f.original_filename);
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div>
        <Link href="/portal" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← My Reports
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">Report history</h1>
        <p className="mt-0.5 text-sm text-zinc-500">All delivered reports for your organisation</p>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No reports delivered yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Completed reports will appear here once your requests have been processed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const hasPbdr = projectsWithPbdr.has(r.id);
            const deliveredDate = r.delivered_at ?? r.created_at;
            const label =
              r.extracted_fields?.["EXTRACT_ADDRESS"] ??
              (r.po_number ? `PO ${r.po_number}` : r.id.slice(0, 8));
            return (
              <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/portal/projects/${r.id}`}
                      className="truncate text-base font-semibold text-zinc-900 hover:underline"
                    >
                      {label}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">Delivered {formatAuDate(deliveredDate)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                    Delivered
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                  {hasPbdr ? (
                    <DownloadPbdrLink projectId={r.id} filename={pbdrFilenameMap.get(r.id)} />
                  ) : (
                    <span className="text-xs text-zinc-400">Processing…</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
