import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
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
  storage_path: string;
  original_filename: string;
};

export default async function ClientHistoryPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, po_number, extracted_fields, status, created_at, delivered_at, expected_delivery_date")
    .eq("org_id", user.org_id as string)
    .in("status", ["delivered", "complete"])
    .order("created_at", { ascending: false });

  const reports = (data ?? []) as DeliveredProject[];

  // Load the latest PBDR file for each delivered project
  const projectIds = reports.map((r) => r.id);
  let pbdrByProject: Map<string, { signedUrl: string; filename: string }> = new Map();

  if (projectIds.length > 0) {
    const { data: pbdrFiles } = await supabase
      .from("project_files")
      .select("project_id, storage_path, original_filename, version")
      .in("project_id", projectIds)
      .eq("file_type", "pbdr")
      .order("version", { ascending: false });

    // Keep only the highest-version PBDR per project
    const latestByProject = new Map<string, PbdrFile>();
    for (const f of (pbdrFiles ?? []) as (PbdrFile & { version: number })[]) {
      if (!latestByProject.has(f.project_id)) {
        latestByProject.set(f.project_id, f);
      }
    }

    // Generate signed URLs (30-day links matching email delivery)
    const entries = (
      await Promise.all(
        [...latestByProject.entries()].map(async ([projId, f]) => {
          const { data: signed } = await supabase.storage
            .from("documents")
            .createSignedUrl(f.storage_path, 30 * 24 * 3600);
          const url = signed?.signedUrl;
          if (!url) return null;
          return [projId, { signedUrl: url, filename: f.original_filename }] as const;
        })
      )
    ).filter((e): e is [string, { signedUrl: string; filename: string }] => e !== null);
    pbdrByProject = new Map(entries);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Report history</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          All delivered reports for your organisation
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No reports delivered yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Completed reports will appear here once your requests have been processed.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[400px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Address</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Delivered</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {reports.map((r) => {
                const pbdr = pbdrByProject.get(r.id);
                const deliveredDate = r.delivered_at ?? r.created_at;
                return (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      {r.extracted_fields?.["EXTRACT_ADDRESS"] ??
                        (r.po_number ? `PO ${r.po_number}` : r.id.slice(0, 8))}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {new Date(deliveredDate).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      {pbdr ? (
                        <a
                          href={pbdr.signedUrl}
                          download={pbdr.filename}
                          className="inline-flex items-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          Download PDF
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-400">Processing…</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
