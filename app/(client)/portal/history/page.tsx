import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DownloadCard } from "@/components/DownloadCard";
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
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {reports.map((r) => {
              const hasPbdr = projectsWithPbdr.has(r.id);
              const deliveredDate = r.delivered_at ?? r.created_at;
              const label =
                r.extracted_fields?.["EXTRACT_ADDRESS"] ??
                (r.po_number ? `PO ${r.po_number}` : r.id.slice(0, 8));
              return (
                <div key={r.id} className="rounded-lg border border-zinc-200 bg-white">
                  {hasPbdr ? (
                    <DownloadCard
                      href={`/api/download/pbdr/${r.id}`}
                      filename={pbdrFilenameMap.get(r.id)}
                      originalFilename={pbdrFilenameMap.get(r.id)}
                      buttonLabel="Download PDF"
                      wrapperClassName="flex items-start justify-between gap-3 px-4 py-4"
                    >
                      <p className="font-medium text-zinc-900 leading-snug">{label}</p>
                      <p className="mt-2 text-xs text-zinc-500">
                        Delivered{" "}
                        {new Date(deliveredDate).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </DownloadCard>
                  ) : (
                    <div className="flex items-start justify-between gap-3 px-4 py-4">
                      <div>
                        <p className="font-medium text-zinc-900 leading-snug">{label}</p>
                        <p className="mt-2 text-xs text-zinc-500">
                          Delivered{" "}
                          {new Date(deliveredDate).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-400">Processing…</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[400px] text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Address</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Delivered</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {reports.map((r) => {
                  const hasPbdr = projectsWithPbdr.has(r.id);
                  const deliveredDate = r.delivered_at ?? r.created_at;
                  return (
                    <tr key={r.id} className="hover:bg-blue-50">
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
                        {hasPbdr ? (
                          <DownloadCard
                            href={`/api/download/pbdr/${r.id}`}
                            filename={pbdrFilenameMap.get(r.id)}
                            originalFilename={pbdrFilenameMap.get(r.id)}
                            buttonLabel="Download PDF"
                            wrapperClassName="inline-flex items-center gap-2"
                          />
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
        </>
      )}
    </div>
  );
}
