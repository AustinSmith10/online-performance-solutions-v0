import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { ProjectStatus, PaymentMethod } from "@/types";

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

const READY_WINDOW_DAYS = 8;

type ProjectRow = {
  id: string;
  po_number: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  created_at: string;
  delivered_at: string | null;
  expected_delivery_date: string | null;
};

type OrgRow = {
  payment_method: PaymentMethod;
  credit_balance: number;
};

function projectLabel(p: Pick<ProjectRow, "extracted_fields" | "po_number" | "id">): string {
  return (
    (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ??
    (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8))
  );
}

// Count Mon–Fri days between fromIso and todayIso (exclusive of today)
function workingDaysElapsed(fromIso: string, todayIso: string): number {
  const start = new Date(fromIso.slice(0, 10) + "T00:00:00Z");
  const end = new Date(todayIso + "T00:00:00Z");
  let days = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const d = cur.getUTCDay();
    if (d !== 0 && d !== 6) days++;
  }
  return days;
}

export default async function ClientPortalPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();
  const orgId = user.org_id as string;
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: projectsData }, { data: orgData }, { data: pendingReviewsData }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, po_number, extracted_fields, status, created_at, delivered_at, expected_delivery_date"
        )
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("organisations")
        .select("payment_method, credit_balance")
        .eq("id", orgId)
        .single(),
      supabase
        .from("stakeholder_reviews")
        .select("project_id, token")
        .eq("stakeholder_email", user.email as string)
        .eq("status", "pending"),
    ]);

  const projects = (projectsData ?? []) as unknown as ProjectRow[];
  const org = orgData as OrgRow | null;

  const pendingTokenMap = new Map<string, string>(
    (pendingReviewsData ?? []).map((r) => [r.project_id as string, r.token as string])
  );
  const pendingApprovals = projects.filter((p) => pendingTokenMap.has(p.id));

  // Complete projects within the 8-working-day window
  const recentlyComplete = projects.filter((p) => {
    if (p.status !== "complete") return false;
    const from = p.delivered_at ?? p.created_at;
    return workingDaysElapsed(from, todayIso) < READY_WINDOW_DAYS;
  });

  // Check which of those this user has already downloaded
  const downloadedIds = new Set<string>();
  if (recentlyComplete.length > 0) {
    const { data: dlRows } = await supabase
      .from("audit_log")
      .select("project_id")
      .eq("event_type", "project.pbdr_downloaded")
      .eq("actor_id", user.id as string)
      .in(
        "project_id",
        recentlyComplete.map((p) => p.id)
      );
    for (const row of dlRows ?? []) downloadedIds.add(row.project_id as string);
  }

  // Ready banner: recently complete + not yet downloaded by this user
  const reportsReady = recentlyComplete.filter((p) => !downloadedIds.has(p.id));

  // Main table: exclude all complete projects (they live in history or the ready banner)
  const activeProjects = projects.filter((p) => p.status !== "complete");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">My report requests</h1>
        <Link
          href="/portal/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          New report request
        </Link>
      </div>

      {/* Credit balance — shown only for credit_deduction orgs */}
      {org?.payment_method === "credit_deduction" && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-5 py-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Credit balance</p>
            <p className="mt-0.5 text-xs text-zinc-500">Tokens available for report requests</p>
          </div>
          <div className="text-right">
            <p
              className={`text-2xl font-semibold tabular-nums ${
                org.credit_balance === 0 ? "text-red-600" : "text-zinc-900"
              }`}
            >
              {org.credit_balance.toLocaleString()}
            </p>
            {org.credit_balance === 0 && (
              <p className="mt-0.5 text-xs text-red-500">
                No credits remaining — contact your account manager
              </p>
            )}
          </div>
        </div>
      )}

      {/* Approval tray */}
      {pendingApprovals.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Awaiting your acknowledgement ({pendingApprovals.length})
          </h2>
          <p className="mt-0.5 text-xs text-amber-700">
            Please review and acknowledge the following reports before they can be finalised.
          </p>
          <ul className="mt-3 space-y-2">
            {pendingApprovals.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border border-amber-100 bg-white px-4 py-2.5"
              >
                <span className="text-sm text-zinc-900">{projectLabel(p)}</span>
                <a
                  href={`/approve/${pendingTokenMap.get(p.id)}`}
                  className="text-sm font-medium text-amber-700 hover:text-amber-900"
                >
                  Review →
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reports ready to download */}
      {reportsReady.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5">
          <h2 className="text-sm font-semibold text-green-900">
            {reportsReady.length === 1 ? "Report" : "Reports"} ready to download (
            {reportsReady.length})
          </h2>
          <p className="mt-0.5 text-xs text-green-700">
            {reportsReady.length === 1 ? "Your report is" : "Your reports are"} complete. Download{" "}
            {reportsReady.length === 1 ? "it" : "them"} below —{" "}
            {reportsReady.length === 1 ? "it moves" : "they move"} to History once downloaded or
            after {READY_WINDOW_DAYS} working days.
          </p>
          <ul className="mt-3 space-y-2">
            {reportsReady.map((p) => {
              const from = p.delivered_at ?? p.created_at;
              const daysElapsed = workingDaysElapsed(from, todayIso);
              const daysLeft = READY_WINDOW_DAYS - daysElapsed;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-green-100 bg-white px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-900">
                      {projectLabel(p)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {daysLeft <= 1
                        ? "Last day to download"
                        : `Available for ${daysLeft} more working day${daysLeft !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <a
                    href={`/api/download/pbdr/${p.id}`}
                    className="ml-4 shrink-0 inline-flex items-center rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                  >
                    Download report
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Project table */}
      {activeProjects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No active report requests</p>
          <p className="mt-1 text-sm text-zinc-500">
            Submit a new request or check{" "}
            <Link href="/portal/history" className="underline underline-offset-2">
              History
            </Link>{" "}
            for past reports.
          </p>
          <Link
            href="/portal/submit"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            New report request
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Project</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Submitted</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Expected delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {activeProjects.map((p) => (
                <ClickableRow key={p.id} href={`/portal/projects/${p.id}`}>
                  <td className="px-5 py-3 font-medium text-zinc-900">{projectLabel(p)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status]}`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString("en-AU")}
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
                    {p.expected_delivery_date ? (
                      new Date(p.expected_delivery_date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
