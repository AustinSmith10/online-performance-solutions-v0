import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProjectStatus } from "@/types";

type DeliveredProject = {
  id: string;
  po_number: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  created_at: string;
  expected_delivery_date: string | null;
};

export default async function ClientHistoryPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, po_number, extracted_fields, status, created_at, expected_delivery_date")
    .eq("org_id", user.org_id as string)
    .in("status", ["delivered", "complete"])
    .order("created_at", { ascending: false });

  const reports = (data ?? []) as DeliveredProject[];

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
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium text-zinc-900">
                    {r.po_number ? `PO ${r.po_number}` : r.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
                    {new Date(r.created_at).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3">
                    {/* PBDR download links are added in #18 (PBDB → PBDR conversion) */}
                    <span className="text-xs text-zinc-400">—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
