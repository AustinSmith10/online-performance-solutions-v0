import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { RestoreButton } from "./_components/RestoreButton";
import { PurgeButton } from "./_components/PurgeButton";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Received",
  assigned: "Received",
  in_progress: "In Progress",
  dispatched: "Awaiting Approval",
  revision_required: "Changes Requested",
  converting: "Finalising Report",
  delivered: "Report Delivered",
  complete: "Complete",
  paused: "On Hold",
};

type DeletedProject = {
  id: string;
  po_number: string | null;
  site_address: string | null;
  status: ProjectStatus;
  deleted_at: string;
};

function daysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default async function ClientRecoveryPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, po_number, site_address, status, deleted_at")
    .eq("org_id", user.org_id as string)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const projects = (data ?? []) as DeletedProject[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/portal" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← My Reports
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">Recovery bin</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Deleted report requests are kept for 30 days before being permanently removed.
          </p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">Recovery bin is empty</p>
          <p className="mt-1 text-sm text-zinc-500">
            Deleted report requests will appear here for 30 days.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {projects.map((p) => {
              const days = daysRemaining(p.deleted_at);
              const label = p.site_address ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
              return (
                <div key={p.id} className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/portal/projects/${p.id}`}
                      className="font-medium text-zinc-900 leading-snug hover:underline"
                    >
                      {label}
                    </Link>
                    <span
                      className={`shrink-0 text-sm font-medium ${days <= 3 ? "text-red-600" : "text-zinc-500"}`}
                    >
                      {days} {days === 1 ? "day" : "days"} left
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                    <span>{STATUS_LABELS[p.status]}</span>
                    <span>·</span>
                    <span>Deleted {new Date(p.deleted_at).toLocaleDateString("en-AU")}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <RestoreButton projectId={p.id} />
                    <PurgeButton projectId={p.id} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[580px] text-sm">
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Address / ID</th>
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
                        <Link href={`/portal/projects/${p.id}`} className="hover:underline">
                          {label}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-zinc-500">{STATUS_LABELS[p.status]}</td>
                      <td className="px-5 py-3 text-zinc-500">
                        {new Date(p.deleted_at).toLocaleDateString("en-AU")}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-sm font-medium ${days <= 3 ? "text-red-600" : "text-zinc-500"}`}
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
        </>
      )}
    </div>
  );
}
