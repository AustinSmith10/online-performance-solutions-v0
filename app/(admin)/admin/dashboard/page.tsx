import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionPanel } from "./_components/ActionPanel";
import { ActiveProjectsList, type ActiveProjectItem } from "./_components/ActiveProjectsList";
import { OnboardingTourProvider } from "@/components/onboarding-tour/context";
import { TourHighlight } from "@/components/onboarding-tour/TourHighlight";
import { ADMIN_TOUR_STEPS } from "@/lib/onboarding/steps";
import type { ProjectStatus } from "@/types";

const IN_FLIGHT_STATUSES: ProjectStatus[] = [
  "submitted",
  "assigned",
  "in_progress",
  "dispatched",
  "revision_required",
  "converting",
];

type ProjectRow = {
  id: string;
  project_number: string | null;
  po_number: string | null;
  site_address: string | null;
  status: ProjectStatus;
  expected_delivery_date: string | null;
  payment_override: boolean;
  payment_override_at: string | null;
  payment_override_reason: string | null;
  assigned_consultant_id: string | null;
  review_buffer_fired_at: string | null;
  qa_completed_by: string | null;
  created_at: string;
  clients: { name: string } | null;
  consultant: { first_name: string | null; last_name: string | null; email: string; phone: string | null } | null;
};

type SystemError = {
  id: string;
  message: string;
  project_id: string | null;
  created_at: string;
};

function projectLabel(p: { project_number: string | null; site_address: string | null; po_number: string | null; id: string }) {
  const addr = p.site_address;
  if (p.project_number && addr) return `${p.project_number} — ${addr}`;
  if (addr) return addr;
  return p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8);
}

function consultantName(c: { first_name: string | null; last_name: string | null; email: string } | null) {
  if (!c) return null;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const { tour } = await searchParams;
  const user = await requireRole("super_admin", "admin");
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
        id, project_number, po_number, site_address, status, expected_delivery_date,
        payment_override, payment_override_at, payment_override_reason, assigned_consultant_id,
        review_buffer_fired_at, qa_completed_by, created_at,
        clients(name),
        consultant:users!projects_assigned_consultant_id_fkey(first_name, last_name, email, phone)
      `)
      .is("deleted_at", null)
      .in("status", IN_FLIGHT_STATUSES)
      .order("created_at", { ascending: false }),

    supabase
      .from("projects")
      .select(`
        id, project_number, po_number, site_address, status, payment_override_at, payment_override_reason,
        clients(name)
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

  const activeProjectItems: ActiveProjectItem[] = allActive.map((p) => ({
    id: p.id,
    href: `/admin/projects/${p.id}`,
    label: projectLabel(p),
    client: p.clients?.name ?? null,
    consultant: consultantName(p.consultant),
    status: p.status,
    dueLabel: p.expected_delivery_date ? new Date(p.expected_delivery_date).toLocaleDateString("en-AU") : null,
    overdue: !!(p.expected_delivery_date && p.expected_delivery_date < todayIso),
    awaitingStakeholder: pendingProjectIds.has(p.id),
    overridePending: p.payment_override,
  }));

  return (
    <OnboardingTourProvider
      steps={ADMIN_TOUR_STEPS}
      seenSteps={user.onboarding_steps_seen ?? []}
      availableStepIds={["admin_intro", "admin_action_queue", "admin_active_projects"]}
      replay={tour === "replay"}
    >
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
        <Link
          href="/admin/projects/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Submit request
        </Link>
      </div>

      {/* Action required — client component owns interactivity */}
      <TourHighlight id="admin_action_queue">
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
      </TourHighlight>

      {/* ── Active projects overview ── */}
      <TourHighlight id="admin_active_projects">
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

          <ActiveProjectsList projects={activeProjectItems} storageKey={`admin-dashboard-views:${user.id}`} />
        </section>
      </TourHighlight>
    </div>
    </OnboardingTourProvider>
  );
}
