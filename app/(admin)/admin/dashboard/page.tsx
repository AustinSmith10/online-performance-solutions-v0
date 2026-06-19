import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
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
  assigned_consultant_id: string | null;
  review_buffer_fired_at: string | null;
  created_at: string;
  organisations: { name: string } | null;
  consultant: { first_name: string | null; last_name: string | null; email: string } | null;
};

type OverrideRow = {
  id: string;
  po_number: string | null;
  site_address: string | null;
  status: ProjectStatus;
  payment_override_at: string | null;
  organisations: { name: string } | null;
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

  const [activeResult, overrideResult, pendingReviewsResult, systemErrorsResult] = await Promise.all([
    supabase
      .from("projects")
      .select(`
        id, po_number, site_address, status, expected_delivery_date,
        payment_override, assigned_consultant_id,
        review_buffer_fired_at, created_at,
        organisations(name),
        consultant:users!projects_assigned_consultant_id_fkey(first_name, last_name, email)
      `)
      .is("deleted_at", null)
      .in("status", IN_FLIGHT_STATUSES)
      .order("created_at", { ascending: false }),

    // Fix #3: separate query — override panel shows all statuses until flag is manually cleared
    supabase
      .from("projects")
      .select("id, po_number, site_address, status, payment_override_at, organisations(name)")
      .is("deleted_at", null)
      .eq("payment_override", true)
      .not("status", "eq", "draft")
      .order("payment_override_at", { ascending: true }),

    supabase
      .from("stakeholder_reviews")
      .select("project_id")
      .eq("status", "pending"),

    supabase
      .from("notifications")
      .select("id, message, project_id, created_at")
      .eq("type", "system_error")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const allActive = (activeResult.data ?? []) as unknown as ProjectRow[];
  const overridePending = (overrideResult.data ?? []) as unknown as OverrideRow[];

  const pendingProjectIds = new Set(
    (pendingReviewsResult.data ?? []).map((r: { project_id: string }) => r.project_id)
  );

  const unassigned = allActive.filter(
    (p) => p.status === "submitted" && !p.assigned_consultant_id
  );
  const overdue = allActive.filter(
    (p) =>
      p.expected_delivery_date &&
      p.expected_delivery_date < todayIso
  );
  const awaitingStakeholder = allActive.filter(
    (p) =>
      p.status === "dispatched" &&
      p.review_buffer_fired_at !== null &&
      pendingProjectIds.has(p.id)
  );
  const systemErrors = (systemErrorsResult.data ?? []) as SystemError[];

  const actionCount =
    unassigned.length +
    awaitingStakeholder.length +
    overridePending.length +
    systemErrors.length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
          {overdue.length > 0 && (
            <p className="mt-0.5 text-sm text-red-600">
              {overdue.length} project{overdue.length !== 1 ? "s" : ""} overdue
            </p>
          )}
        </div>
        <Link
          href="/admin/recovery"
          className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline"
        >
          Recovery Bin &rarr;
        </Link>
      </div>

      {/* ── Action required ── */}
      {actionCount > 0 && (
        <section className="space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Action required
          </h2>

          {/* Unassigned submissions */}
          {unassigned.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-white">
              <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                  {unassigned.length}
                </span>
                <span className="text-sm font-medium text-blue-900">
                  New submission{unassigned.length !== 1 ? "s" : ""} awaiting consultant assignment
                </span>
              </div>
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b border-zinc-100">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Address / Ref</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Organisation</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Submitted</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {unassigned.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50">
                      <td className="px-5 py-3 font-medium text-zinc-900">
                        {projectLabel(p)}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        {p.organisations?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                        {new Date(p.created_at).toLocaleDateString("en-AU")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/projects/${p.id}#assign`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Assign &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Awaiting stakeholder response */}
          {awaitingStakeholder.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-white">
              <div className="flex items-center gap-2 border-b border-orange-100 bg-orange-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-xs font-semibold text-white">
                  {awaitingStakeholder.length}
                </span>
                <span className="text-sm font-medium text-orange-900">
                  Awaiting stakeholder response — action required
                </span>
              </div>
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-zinc-100">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Address / Ref</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Organisation</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Buffer fired</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {awaitingStakeholder.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50">
                      <td className="px-5 py-3 font-medium text-zinc-900">
                        {projectLabel(p)}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        {p.organisations?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                        {p.review_buffer_fired_at
                          ? new Date(p.review_buffer_fired_at).toLocaleDateString("en-AU")
                          : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-3 text-xs font-medium">
                          <Link href={`/admin/projects/${p.id}#stakeholders`} className="text-blue-600 hover:underline">Re-send</Link>
                          <Link href={`/admin/projects/${p.id}#stakeholders`} className="text-blue-600 hover:underline">Update email</Link>
                          <Link href={`/admin/projects/${p.id}#stakeholders`} className="text-blue-600 hover:underline">Waive</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Override — Payment Pending */}
          {overridePending.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-white">
              <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold text-white">
                  {overridePending.length}
                </span>
                <span className="text-sm font-medium text-amber-900">
                  Override — Payment Pending
                </span>
              </div>
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b border-zinc-100">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Address / Ref</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Organisation</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Status</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-zinc-500">Override date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {overridePending.map((p) => (
                    <ClickableRow key={p.id} href={`/admin/projects/${p.id}`}>
                      <td className="px-5 py-3 font-medium text-zinc-900">
                        {projectLabel(p)}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">
                        {p.organisations?.name ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                        {p.payment_override_at
                          ? new Date(p.payment_override_at).toLocaleDateString("en-AU")
                          : "—"}
                      </td>
                    </ClickableRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* System errors */}
          {systemErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-white">
              <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
                  {systemErrors.length}
                </span>
                <span className="text-sm font-medium text-red-900">System errors</span>
              </div>
              <ul className="divide-y divide-zinc-50">
                {systemErrors.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-4 px-5 py-3">
                    <div className="flex-1">
                      <p className="text-sm text-zinc-800">{n.message}</p>
                      {n.project_id && (
                        <Link
                          href={`/admin/projects/${n.project_id}`}
                          className="mt-0.5 text-xs text-zinc-400 hover:underline"
                        >
                          Project {n.project_id.slice(0, 8)}
                        </Link>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-xs text-zinc-400">
                      {new Date(n.created_at).toLocaleDateString("en-AU")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

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
            All projects &rarr;
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
