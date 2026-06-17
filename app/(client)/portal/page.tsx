import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { ProjectStatus, PaymentMethod } from "@/types";

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

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

type ProjectRow = {
  id: string;
  po_number: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  created_at: string;
  expected_delivery_date: string | null;
};

type OrgRow = {
  payment_method: PaymentMethod;
  credit_balance: number;
};

export default async function ClientPortalPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();
  const orgId = user.org_id as string;
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: projectsData }, { data: orgData }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, po_number, extracted_fields, status, created_at, expected_delivery_date")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("organisations")
      .select("payment_method, credit_balance")
      .eq("id", orgId)
      .single(),
  ]);

  const projects = (projectsData ?? []) as ProjectRow[];
  const org = orgData as OrgRow | null;

  // Projects in 'dispatched' status are awaiting client acknowledgement.
  // Tokenised approval links (built in #17) will make these actionable.
  const pendingApprovals = projects.filter((p) => p.status === "dispatched");

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
              <p className="mt-0.5 text-xs text-red-500">No credits remaining — contact your account manager</p>
            )}
          </div>
        </div>
      )}

      {/* Approval tray — projects dispatched for client acknowledgement */}
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
                <span className="text-sm text-zinc-900">
                  {(p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) || (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8))}
                </span>
                <Link
                  href={`/portal/projects/${p.id}`}
                  className="text-sm font-medium text-amber-700 hover:text-amber-900"
                >
                  Review →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Project list */}
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
              {projects.map((p) => {
                const isOverdue =
                  !!p.expected_delivery_date &&
                  p.expected_delivery_date < todayIso &&
                  !TERMINAL_STATUSES.has(p.status);
                return (
                  <ClickableRow key={p.id} href={`/portal/projects/${p.id}`}>
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      {(p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) || (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8))}
                    </td>
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
                        <span className={isOverdue ? "font-medium text-red-600" : ""}>
                          Your report is due by{" "}
                          {new Date(p.expected_delivery_date).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {isOverdue && (
                            <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              Overdue
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
