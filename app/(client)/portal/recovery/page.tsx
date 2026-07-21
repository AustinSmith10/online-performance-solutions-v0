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

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
  paused: "bg-amber-100 text-amber-700",
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
  const user = await requireRole("stakeholder");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, po_number, site_address, status, deleted_at")
    .eq("client_id", user.client_id as string)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const projects = (data ?? []) as DeletedProject[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div>
        <Link href="/portal" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← My Reports
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">Recovery bin</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Deleted report requests are kept for 30 days before being permanently removed.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">Recovery bin is empty</p>
          <p className="mt-1 text-sm text-zinc-500">
            Deleted report requests will appear here for 30 days.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const days = daysRemaining(p.deleted_at);
            const label = p.site_address ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
            return (
              <div key={p.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/portal/projects/${p.id}`}
                      className="truncate text-base font-semibold text-zinc-900 hover:underline"
                    >
                      {label}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      Deleted {new Date(p.deleted_at).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    <span className={`text-xs font-medium ${days <= 3 ? "text-red-600" : "text-zinc-500"}`}>
                      {days} {days === 1 ? "day" : "days"} left
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4">
                  <RestoreButton projectId={p.id} />
                  <PurgeButton projectId={p.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
