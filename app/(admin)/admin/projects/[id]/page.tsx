import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignForm, type ConsultantOption } from "./_components/AssignForm";
import { OverrideForm } from "./_components/OverrideForm";
import { FieldsForm } from "./_components/FieldsForm";
import { FileUploadForm } from "./_components/FileUploadForm";
import { prettifyToken } from "@/lib/tokens/prettify";
import type { ProjectStatus, ConsultantAvailability } from "@/types";

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

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  building_plans: "Building Plans",
  po: "Purchase Order",
  additional: "Additional",
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
        extracted_fields,
        template_id,
        delivery_recipient_email,
        expected_delivery_date,
        credit_deducted,
        payment_override,
        payment_override_reason,
        payment_override_at,
        deleted_at,
        created_at,
        updated_at,
        source,
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
    extracted_fields: Record<string, string> | null;
    template_id: string | null;
    delivery_recipient_email: string | null;
    expected_delivery_date: string | null;
    credit_deducted: boolean;
    payment_override: boolean;
    payment_override_reason: string | null;
    payment_override_at: string | null;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
    source: "portal" | "email";
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
  const isDeleted = !!project.deleted_at;
  const consultants = (consultantsResult.data ?? []) as ConsultantOption[];
  const currentConsultantId = project.assigned?.id ?? "";

  // Load template mappings, submission files, and PBDB files in parallel
  const [{ data: mappings }, { data: rawSubmissionFiles }, { data: rawPbdbFiles }] =
    await Promise.all([
      project.template_id
        ? supabase
            .from("template_field_mappings")
            .select("placeholder_token, field_key, display_label")
            .eq("template_id", project.template_id)
            .order("placeholder_token")
        : Promise.resolve({ data: [] }),
      supabase
        .from("project_files")
        .select("id, file_type, original_filename, storage_path, created_at")
        .eq("project_id", id)
        .in("file_type", ["po", "building_plans", "additional"])
        .order("created_at"),
      supabase
        .from("project_files")
        .select("id, original_filename, storage_path, version, created_at")
        .eq("project_id", id)
        .eq("file_type", "pbdb")
        .order("version", { ascending: true }),
    ]);

  const [files, pbdbFiles] = await Promise.all([
    Promise.all(
      (rawSubmissionFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(f.storage_path as string, 3600);
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
    Promise.all(
      (rawPbdbFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("documents")
          .createSignedUrl(f.storage_path as string, 3600);
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
  ]);

  const labelMap = new Map<string, string>(
    (mappings ?? []).map((m) => [
      m.placeholder_token as string,
      (m.display_label as string | null) ?? prettifyToken(m.placeholder_token as string),
    ])
  );

  const extractedFields = project.extracted_fields ?? {};
  const fieldEntries = Object.entries(extractedFields).map(([token, value]) => ({
    token,
    label: labelMap.get(token) ?? prettifyToken(token),
    value: value as string,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={isDeleted ? "/admin/recovery" : "/admin/projects"}
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          {isDeleted ? "← Recovery bin" : "← Projects"}
        </Link>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-zinc-900">
            {(project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ||
              (project.po_number ? `PO ${project.po_number}` : (project.project_number ?? project.id.slice(0, 8)))}
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

      {isDeleted && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">This project is in the recovery bin.</span>{" "}
          It will be permanently deleted after 30 days.{" "}
          <Link href="/admin/recovery" className="font-medium underline hover:text-amber-900">
            Go to recovery bin →
          </Link>
        </div>
      )}

      {/* Project details */}
      <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        <Row label="Organisation" value={project.organisations?.name ?? "—"} />
        <Row
          label="Submitted via"
          value={
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                project.source === "email"
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {project.source === "email" ? "Email" : "Portal"}
            </span>
          }
        />
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

      {/* Submitted field values — editable by Super Admin */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Field values</h2>
        <FieldsForm projectId={id} fields={fieldEntries} />
      </div>

      {/* PBDB version history */}
      {pbdbFiles.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">PBDB</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {pbdbFiles.map((f) => {
              const version = f.version as number;
              const isQa = version >= 2;
              return (
                <div
                  key={f.id as string}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {f.original_filename as string}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Version {version}
                      {isQa ? " — QA corrected" : " — Generated"}
                      {" · "}
                      {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  {f.signedUrl && (
                    <a
                      href={f.signedUrl}
                      download={f.original_filename as string}
                      className="ml-4 shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Download
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
        </div>
        {files.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {files.map((f) => (
              <div
                key={f.id as string}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-sm text-zinc-900">
                    {f.original_filename as string}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {FILE_TYPE_LABELS[f.file_type as string] ?? f.file_type}{" "}
                    &middot;{" "}
                    {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                </div>
                {f.signedUrl && (
                  <a
                    href={f.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        {!isDeleted && (
          <div className="border-t border-zinc-100 px-5 py-4">
            <FileUploadForm projectId={id} />
          </div>
        )}
      </div>

      {/* Assignment — hidden for deleted projects */}
      {!isDeleted && <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Consultant assignment</h2>

        {project.assigned && (
          <p className="mb-4 text-sm text-zinc-500">
            Currently assigned to{" "}
            <strong className="text-zinc-800">
              {[project.assigned.first_name, project.assigned.last_name]
                .filter(Boolean)
                .join(" ") || project.assigned.email}
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
      </div>}

      {/* Payment gate — hidden for deleted projects */}
      {!isDeleted && <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Payment gate</h2>

        <div className="mb-4 flex gap-6 text-sm">
          <span>
            <span className="text-zinc-500">Credit deducted: </span>
            <span
              className={
                project.credit_deducted
                  ? "font-medium text-green-700"
                  : "text-zinc-500"
              }
            >
              {project.credit_deducted ? "Yes" : "No"}
            </span>
          </span>
          {project.payment_override && (
            <span>
              <span className="text-zinc-500">Override applied: </span>
              <span className="font-medium text-amber-700">
                {project.payment_override_at
                  ? new Date(project.payment_override_at).toLocaleDateString(
                      "en-AU"
                    )
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
      </div>}
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
