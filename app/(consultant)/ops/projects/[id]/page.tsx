import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileUploadForm } from "./_components/FileUploadForm";
import { ProjectNumberForm } from "./_components/ProjectNumberForm";
import { PbdbQaUploadForm } from "./_components/PbdbQaUploadForm";
import { MarkQaCompleteButton } from "./_components/MarkQaCompleteButton";
import { prettifyToken } from "@/lib/tokens/prettify";
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

const FILE_TYPE_LABELS: Record<string, string> = {
  building_plans: "Building Plans",
  po: "Purchase Order",
  additional: "Additional",
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

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
      "id, extracted_fields, status, po_number, project_number, template_id, review_cycle, created_at, expected_delivery_date, source, organisations(name, state_territory), submitter:users!projects_submitted_by_fkey(first_name, last_name, email, phone, company_role)"
    )
    .eq("id", id)
    .eq("assigned_consultant_id", user.id)
    .maybeSingle();

  if (!data) notFound();

  type ProjectDetail = {
    id: string;
    extracted_fields: Record<string, string> | null;
    status: ProjectStatus;
    po_number: string | null;
    project_number: string | null;
    template_id: string | null;
    review_cycle: number;
    created_at: string;
    expected_delivery_date: string | null;
    source: "portal" | "email";
    organisations: { name: string; state_territory: string | null } | null;
    submitter: {
      first_name: string | null;
      last_name: string | null;
      email: string;
      phone: string | null;
      company_role: string | null;
    } | null;
  };

  const project = data as unknown as ProjectDetail;
  const todayIso = new Date().toISOString().slice(0, 10);
  const isOverdue =
    !!project.expected_delivery_date &&
    project.expected_delivery_date < todayIso &&
    !TERMINAL_STATUSES.has(project.status);

  // Load template mappings, submission files, PBDB files, and stakeholder reviews
  const [{ data: mappings }, { data: rawSubmissionFiles }, { data: rawPbdbFiles }, { data: rawReviews }] =
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
      project.status === "revision_required"
        ? supabase
            .from("stakeholder_reviews")
            .select("id, stakeholder_name, stakeholder_email, status, comments, responded_at, review_cycle")
            .eq("project_id", id)
            .eq("review_cycle", project.review_cycle)
            .eq("status", "rejected_with_comments")
            .order("responded_at", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

  // Generate signed URLs — submission files from `submissions`, PBDB from `documents`
  const submissionFiles = await Promise.all(
    (rawSubmissionFiles ?? []).map(async (f) => {
      const { data: signed } = await supabase.storage
        .from("submissions")
        .createSignedUrl(f.storage_path as string, 3600);
      return { ...f, signedUrl: signed?.signedUrl ?? null };
    })
  );

  const pbdbFiles = rawPbdbFiles ?? [];
  const latestPbdb = pbdbFiles[pbdbFiles.length - 1] ?? null;
  const hasQaFile = pbdbFiles.some((f) => (f.version as number) >= 2);
  const modificationComments = (rawReviews ?? []) as {
    id: string; stakeholder_name: string; stakeholder_email: string;
    status: string; comments: string | null; responded_at: string | null; review_cycle: number;
  }[];

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

  const title =
    (project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ||
    (project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← My projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
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

      {/* Project summary */}
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
                {new Date(project.expected_delivery_date).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "short", year: "numeric" }
                )}
              </span>
            ) : (
              "—"
            )
          }
        />
      </div>

      {/* Client contact */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Client contact</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            The person who submitted this project — your point of contact for any queries.
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {project.submitter ? (
            <>
              <Row
                label="Name"
                value={
                  [project.submitter.first_name, project.submitter.last_name]
                    .filter(Boolean)
                    .join(" ") || "—"
                }
              />
              <Row
                label="Email"
                value={
                  <a
                    href={`mailto:${project.submitter.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {project.submitter.email}
                  </a>
                }
              />
              {project.submitter.phone && (
                <Row
                  label="Phone"
                  value={
                    <a href={`tel:${project.submitter.phone}`} className="text-blue-600 hover:underline">
                      {project.submitter.phone}
                    </a>
                  }
                />
              )}
              {project.submitter.company_role && (
                <Row label="Role" value={project.submitter.company_role} />
              )}
              {project.organisations && (
                <>
                  <Row label="Organisation" value={project.organisations.name} />
                  {project.organisations.state_territory && (
                    <Row label="State / Territory" value={project.organisations.state_territory} />
                  )}
                </>
              )}
            </>
          ) : (
            <div className="px-5 py-4 text-sm text-zinc-400">
              No submitter on record — project may have been submitted via email.
            </div>
          )}
        </div>
      </div>

      {/* Submitted field values */}
      {fieldEntries.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Submitted details</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {fieldEntries.map(({ token, label, value }) => (
              <Row key={token} label={label} value={value || "—"} />
            ))}
          </div>
        </div>
      )}

      {/* PBDB */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">PBDB</h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {!project.project_number ? (
            <div className="px-5 py-4">
              <ProjectNumberForm projectId={id} />
            </div>
          ) : !latestPbdb ? (
            <div className="px-5 py-4">
              <p className="text-sm text-zinc-500">
                PBDB is being generated — refresh in a moment.
              </p>
            </div>
          ) : (
            pbdbFiles.map((f) => {
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
                  <a
                    href={`/api/download/pbdb/${f.id as string}`}
                    className="ml-4 shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Download
                  </a>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Revision required — stakeholder comments + re-upload */}
      {project.status === "revision_required" && (
        <div className="rounded-lg border border-red-200 bg-red-50">
          <div className="border-b border-red-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-red-800">Rejection feedback</h2>
            <p className="mt-1 text-xs text-red-600">
              One or more stakeholders have rejected this PBDB. Review their feedback below,
              correct the document in Word, upload the revised version, then mark revision complete.
            </p>
          </div>
          <div className="space-y-6 px-5 py-5">
            {modificationComments.length > 0 && (
              <div className="space-y-3">
                {modificationComments.map((r) => (
                  <div key={r.id} className="rounded-md border border-red-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-zinc-700">
                        {r.stakeholder_name}{" "}
                        <span className="font-normal text-zinc-400">&lt;{r.stakeholder_email}&gt;</span>
                      </p>
                      <span className="shrink-0 text-xs text-zinc-400">
                        {r.responded_at
                          ? new Date(r.responded_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                          : ""}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-800">{r.comments}</p>
                  </div>
                ))}
              </div>
            )}
            <PbdbQaUploadForm
              projectId={id}
              submitLabel="Upload revised PBDB and re-submit to stakeholders"
            />
          </div>
        </div>
      )}

      {/* QA correction + Documents — side by side */}
      <div className={project.status === "in_progress" && latestPbdb ? "grid grid-cols-1 gap-6 items-start lg:grid-cols-2" : ""}>
        {/* QA correction — only shown while in_progress */}
        {project.status === "in_progress" && latestPbdb && (
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-900">Submit completed PBDB</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Open the generated PBDB in Word, insert the plan images at the correct
                positions, correct any errors, then upload your completed version here.
              </p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <PbdbQaUploadForm projectId={id} />
              {hasQaFile && <MarkQaCompleteButton projectId={id} />}
            </div>
          </div>
        )}

        {/* Submission documents */}
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
          </div>
          {submissionFiles.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">No documents uploaded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {submissionFiles.map((f) => (
                <div
                  key={f.id as string}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div>
                    <p className="text-sm text-zinc-900">{f.original_filename as string}</p>
                    <p className="text-xs text-zinc-500">
                      {FILE_TYPE_LABELS[f.file_type as string] ?? f.file_type} &middot;{" "}
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
          <div className="border-t border-zinc-100 px-5 py-4">
            <FileUploadForm projectId={id} />
          </div>
        </div>
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
