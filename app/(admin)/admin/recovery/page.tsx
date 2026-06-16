import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { RestoreButton } from "./_components/RestoreButton";
import { PurgeButton } from "./_components/PurgeButton";
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

type DeletedProject = {
  id: string;
  po_number: string | null;
  site_address: string | null;
  status: ProjectStatus;
  deleted_at: string;
  organisations: { name: string } | null;
};

function daysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default async function AdminRecoveryPage() {
  await requireRole("super_admin");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, po_number, site_address, status, deleted_at, organisations(name)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const projects = (data ?? []) as unknown as DeletedProject[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Recovery bin</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          All organisations&apos; deleted projects. Permanently purged after 30 days.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Recovery bin is empty.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Address / ID</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status at deletion</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Deleted</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Days remaining</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {projects.map((p) => {
                const days = daysRemaining(p.deleted_at);
                const label = p.site_address ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
                return (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="hover:underline"
                      >
                        {label}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">
                      {p.organisations?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {STATUS_LABELS[p.status]}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {new Date(p.deleted_at).toLocaleDateString("en-AU")}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-sm font-medium ${
                          days <= 3 ? "text-red-600" : "text-zinc-500"
                        }`}
                      >
                        {days} {days === 1 ? "day" : "days"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <RestoreButton projectId={p.id} />
                        <PurgeButton projectId={p.id} />
                      </div>
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
