import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_review: "In review",
  qa: "QA",
  approved: "Approved",
  dispatched: "Dispatched",
  delivered: "Delivered",
  complete: "Complete",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-yellow-100 text-yellow-700",
  in_review: "bg-purple-100 text-purple-700",
  qa: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  dispatched: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
};

export default async function ClientPortalPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, po_number, status, created_at, expected_delivery_date")
    .eq("org_id", user.org_id as string)
    .order("created_at", { ascending: false });

  type ProjectRow = {
    id: string;
    po_number: string | null;
    status: ProjectStatus;
    created_at: string;
    expected_delivery_date: string | null;
  };

  const projects = (data ?? []) as ProjectRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">My report requests</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Logged in as {user.email}</p>
        </div>
        <Link
          href="/portal/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          New report request
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No report requests yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Submit your first report request to get started.
          </p>
          <Link
            href="/portal/submit"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            New report request
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">PO number</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Submitted</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Expected delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium text-zinc-900">
                    {p.po_number ?? p.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString("en-AU")}
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
                    {p.expected_delivery_date
                      ? new Date(p.expected_delivery_date).toLocaleDateString("en-AU")
                      : <span className="text-zinc-300">—</span>}
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
