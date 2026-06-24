import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import { ActionPanel } from "./_components/ActionPanel";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  qa_complete: "QA Complete",
  dispatched: "Awaiting Approval",
  revision_required: "Revision Required",
  converting: "Converting to PBDR",
  delivered: "Delivered",
  complete: "Complete",
  paused: "Paused",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-purple-100 text-purple-700",
  qa_complete: "bg-teal-100 text-teal-700",
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
  paused: "bg-amber-100 text-amber-700",
};

const IN_FLIGHT_STATUSES: ProjectStatus[] = [
  "submitted",
  "assigned",
  "in_progress",
  "qa_complete",
  "dispatched",
  "revision_required",
  "converting",
];

type ProjectRow = {
  id: string;
  po_number: string | null;
  site_address: string | null;
  status: ProjectStatus;
  expected_delivery_date: string | null;
  payment_override: boolean;
  payment_override_at: string | null;
  payment_override_reason: string | null;
  assigned_consultant_id: string | null;
  review_buffer_fired_at: string | null;
  created_at: string;
  organisations: { name: string } | null;
  consultant: { first_name: string | null; last_name: string | null; email: string; phone: string | null } | null;
};

type SystemError = {
  id: string;
  message: string;
  project_id: string | null;
  created_at: string;
};

function projectLabel(p: { site_address: string | null; po_number: string | null; id: string }) {
  return p.site_address ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
}

function consultantName(c: { first_name: string | null; last_name: string | null; email: string } | null) {
  if (!c) return null;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
}

export default async function AdminDashboardPage() {
  await requireRole("super_admin");
  const supabase = createAdminClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [
    activeResult,
    overrideResult,
    pendingReviewsResult,
    systemErrorsResult,
    consultantsResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(`
        id, po_number, site_address, status, expected_delivery_date,
        payment_override, payment_override_at, payment_override_reason, assigned_consultant_id,
        review_buffer_fired_at, created_at,
        organisations(name),
        consultant:users!projects_assigned_consultant_id_fkey(first_name, last_name, email, phone)
      `)
      .is("deleted_at", null)
      .in("status", IN_FLIGHT_STATUSES)
      .order("created_at", { ascending: false }),

    supabase
      .from("projects")
      .select(`
        id, po_number, site_address, status, payment_override_at, payment_override_reason,
        organisations(name)
      `)
      .is("deleted_at", null)
      .eq("payment_override", true)
      .not("status", "eq", "draft")
      .order("payment_override_at", { ascending: true }),

    // Full review details needed for the stakeholder drawer
    supabase
      .from("stakeholder_reviews")
      .select("id, project_id, stakeholder_email, stakeholder_name, expires_at, fresh_token_sent_at")
      .eq("status", "pending"),

    supabase
      .from("notifications")
      .select("id, message, project_id, created_at")
      .eq("type", "system_error")
      .order("created_at", { ascending: false })
      .limit(10),

    // Consultants for the assign drawer
    supabase
      .from("users")
      .select("id, first_name, last_name, email, availability")
      .eq("role", "consultant")
      .order("first_name"),
  ]);

  const allActive = (activeResult.data ?? []) as unknown as ProjectRow[];
  const overridePending = (overrideResult.data ?? []) as unknown as ProjectRow[];

  const pendingCountByProject: Record<string, number> = {};
  const pendingProjectIds = new Set<string>();
  for (const r of (pendingReviewsResult.data ?? []) as { project_id: string }[]) {
    pendingCountByProject[r.project_id] = (pendingCountByProject[r.project_id] ?? 0) + 1;
    pendingProjectIds.add(r.project_id);
  }

  const overdue = allActive.filter(
    (p) => p.expected_delivery_date && p.expected_delivery_date < todayIso
  );
  const overdueIds = new Set(overdue.map((p) => p.id));
  const unassigned = allActive.filter(
    (p) => p.status === "submitted" && !p.assigned_consultant_id && !overdueIds.has(p.id)
  );
  const awaitingStakeholder = allActive.filter(
    (p) =>
      p.status === "dispatched" &&
      p.review_buffer_fired_at !== null &&
      pendingProjectIds.has(p.id)
  );
  const systemErrors = (systemErrorsResult.data ?? []) as SystemError[];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
        <Link
          href="/admin/recovery"
          className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline"
        >
          Recovery Bin →
        </Link>
      </div>

      {/* Action required — client component owns interactivity */}
      <ActionPanel
        unassigned={unassigned as unknown as import("./_components/ActionPanel").DashboardProject[]}
        overdue={overdue as unknown as import("./_components/ActionPanel").DashboardProject[]}
        awaitingStakeholder={awaitingStakeholder as unknown as import("./_components/ActionPanel").DashboardProject[]}
        overridePending={overridePending as unknown as import("./_components/ActionPanel").DashboardProject[]}
        pendingCountByProject={pendingCountByProject}
        pendingReviews={(pendingReviewsResult.data ?? []) as unknown as import("./_components/ActionPanel").PendingReview[]}
        consultants={(consultantsResult.data ?? []) as unknown as import("./_components/ActionPanel").ConsultantOption[]}
        todayIso={todayIso}
        systemErrors={systemErrors}
      />

      {/* ── Active projects overview ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Active projects ({allActive.length})
          </h2>
          <Link
            href="/admin/projects"
            className="text-xs text-zinc-400 hover:text-zinc-700 hover:underline"
          >
            All projects →
          </Link>
        </div>

        {allActive.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            No active projects.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-zinc-100">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Address / Ref</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Consultant</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left font-medium text-zinc-500">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {allActive.map((p) => {
                  const isOverdue =
                    p.expected_delivery_date && p.expected_delivery_date < todayIso;
                  return (
                    <ClickableRow key={p.id} href={`/admin/projects/${p.id}`}>
                      <td className="max-w-[200px] truncate px-5 py-3 font-medium text-zinc-900">
                        {projectLabel(p)}
                      </td>
                      <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">
                        {p.organisations?.name ?? "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">
                        {consultantName(p.consultant) ?? (
                          <span className="text-zinc-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status]}`}
                          >
                            {STATUS_LABELS[p.status]}
                          </span>
                          {isOverdue && (
                            <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                        {p.expected_delivery_date
                          ? new Date(p.expected_delivery_date).toLocaleDateString("en-AU")
                          : "—"}
                      </td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
