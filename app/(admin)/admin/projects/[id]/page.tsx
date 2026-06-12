import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignForm, type ConsultantOption } from "./_components/AssignForm";
import { OverrideForm } from "./_components/OverrideForm";
import type { ProjectStatus, ConsultantAvailability } from "@/types";

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

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [projectResult, consultantsResult] = await Promise.all([
    supabase
      .from("projects")
      .select(`
        id,
        project_number,
        po_number,
        status,
        delivery_recipient_email,
        expected_delivery_date,
        credit_deducted,
        payment_override,
        payment_override_reason,
        payment_override_at,
        created_at,
        updated_at,
        organisations(id, name),
        assigned:users!projects_assigned_consultant_id_fkey(id, first_name, last_name, email, availability)
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id, first_name, last_name, email, availability")
      .eq("role", "consultant")
      .eq("is_locked", false)
      .order("first_name"),
  ]);

  if (!projectResult.data) notFound();

  type ProjectDetail = {
    id: string;
    project_number: string | null;
    po_number: string | null;
    status: ProjectStatus;
    delivery_recipient_email: string | null;
    expected_delivery_date: string | null;
    credit_deducted: boolean;
    payment_override: boolean;
    payment_override_reason: string | null;
    payment_override_at: string | null;
    created_at: string;
    updated_at: string;
    organisations: { id: string; name: string } | null;
    assigned: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      availability: ConsultantAvailability;
    } | null;
  };

  const project = projectResult.data as unknown as ProjectDetail;
  const consultants = (consultantsResult.data ?? []) as ConsultantOption[];

  const currentConsultantId = project.assigned?.id ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/projects" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Projects
        </Link>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-zinc-900">
            {project.project_number ?? project.id.slice(0, 8)}
          </h1>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {STATUS_LABELS[project.status]}
          </span>
          {project.payment_override && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Override — Payment Pending
            </span>
          )}
        </div>
      </div>

      {/* Project details */}
      <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        <Row label="Organisation" value={project.organisations?.name ?? "—"} />
        <Row label="PO number" value={project.po_number ?? "—"} />
        <Row label="Delivery recipient" value={project.delivery_recipient_email ?? "—"} />
        <Row
          label="Expected delivery"
          value={
            project.expected_delivery_date
              ? new Date(project.expected_delivery_date).toLocaleDateString("en-AU")
              : "—"
          }
        />
        <Row
          label="Created"
          value={new Date(project.created_at).toLocaleDateString("en-AU")}
        />
      </div>

      {/* Assignment */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Consultant assignment</h2>

        {project.assigned && (
          <p className="mb-4 text-sm text-zinc-500">
            Currently assigned to{" "}
            <strong className="text-zinc-800">
              {[project.assigned.first_name, project.assigned.last_name].filter(Boolean).join(" ") ||
                project.assigned.email}
            </strong>{" "}
            &mdash;{" "}
            <span
              className={`font-medium ${
                project.assigned.availability === "available"
                  ? "text-green-700"
                  : project.assigned.availability === "on_leave"
                  ? "text-yellow-700"
                  : "text-zinc-500"
              }`}
            >
              {AVAILABILITY_LABELS[project.assigned.availability]}
            </span>
          </p>
        )}

        <AssignForm
          projectId={id}
          consultants={consultants}
          currentConsultantId={currentConsultantId}
          isReassign={!!project.assigned}
        />

        {consultants.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400">
            No consultants available. Invite a consultant from the{" "}
            <Link href="/admin/users/invite" className="underline">
              users page
            </Link>
            .
          </p>
        )}
      </div>

      {/* Payment gate */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Payment gate</h2>

        <div className="mb-4 flex gap-6 text-sm">
          <span>
            <span className="text-zinc-500">Credit deducted: </span>
            <span className={project.credit_deducted ? "font-medium text-green-700" : "text-zinc-500"}>
              {project.credit_deducted ? "Yes" : "No"}
            </span>
          </span>
          {project.payment_override && (
            <span>
              <span className="text-zinc-500">Override applied: </span>
              <span className="font-medium text-amber-700">
                {project.payment_override_at
                  ? new Date(project.payment_override_at).toLocaleDateString("en-AU")
                  : "Yes"}
              </span>
            </span>
          )}
        </div>

        {project.payment_override && project.payment_override_reason && (
          <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-medium">Override reason: </span>
            {project.payment_override_reason}
          </div>
        )}

        <OverrideForm
          projectId={id}
          alreadyOverridden={project.payment_override}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-44 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}
