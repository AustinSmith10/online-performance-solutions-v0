import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
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

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

type ProjectDetail = {
  id: string;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  po_number: string | null;
  created_at: string;
  expected_delivery_date: string | null;
  organisations: { name: string } | null;
};

export default async function ConsultantProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select(
      "id, extracted_fields, status, po_number, created_at, expected_delivery_date, organisations(name)"
    )
    .eq("id", id)
    .eq("assigned_consultant_id", user.id)
    .maybeSingle();

  if (!data) notFound();

  const project = data as unknown as ProjectDetail;
  const todayIso = new Date().toISOString().slice(0, 10);
  const isOverdue =
    !!project.expected_delivery_date &&
    project.expected_delivery_date < todayIso &&
    !TERMINAL_STATUSES.has(project.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← My projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">
            {project.extracted_fields?.CLIENT_ADDRESS ?? project.id.slice(0, 8)}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[project.status]}`}
          >
            {STATUS_LABELS[project.status]}
          </span>
          {isOverdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Overdue
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        <Row label="Organisation" value={project.organisations?.name ?? "—"} />
        <Row label="PO number" value={project.po_number ?? "—"} />
        <Row
          label="Submitted"
          value={new Date(project.created_at).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        />
        <Row
          label="Expected delivery"
          value={
            project.expected_delivery_date ? (
              <span className={isOverdue ? "font-medium text-red-600" : ""}>
                {new Date(project.expected_delivery_date).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            ) : (
              "—"
            )
          }
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
