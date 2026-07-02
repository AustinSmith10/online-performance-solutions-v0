import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileUploadForm } from "./_components/FileUploadForm";
import { ProjectNumberForm } from "./_components/ProjectNumberForm";
import { PbdbQaUploadForm } from "./_components/PbdbQaUploadForm";
import { QaUploadedBanner } from "./_components/QaUploadedBanner";
import { StepIndicator } from "./_components/StepIndicator";
import { prettifyToken } from "@/lib/tokens/prettify";
import { ProjectStripColorToggle } from "@/components/ProjectStripColorToggle";
import { DownloadCard } from "@/components/DownloadCard";
import { GeneratePbdbButton, RegeneratePbdbButton } from "@/components/PbdbGenerationButtons";
import { PickedUpBanner } from "@/app/(consultant)/ops/_components/PickedUpBanner";
import { CollapsibleSection } from "./_components/CollapsibleSection";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
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
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
  paused: "bg-amber-100 text-amber-700",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  building_plans: "Building Plans",
  building_drawing_plans: "Building Drawing Plans",
  po: "Purchase Order",
  purchase_order: "Purchase Order",
  additional: "Additional",
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

export default async function ConsultantProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const justPickedUp = sp.picked_up === "1";
  const justUploadedQa = sp.qa_uploaded === "1";
  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select(
      "id, extracted_fields, status, po_number, project_number, template_id, review_cycle, created_at, expected_delivery_date, source, strip_token_color, qa_completed_by, clients(name, state_territory, client_config), submitter:users!projects_submitted_by_fkey(first_name, last_name, email, phone, company_role)"
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
    strip_token_color: boolean;
    qa_completed_by: string | null;
    clients: { name: string; state_territory: string | null; client_config: Record<string, string> } | null;
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

  const [
    { data: mappings },
    { data: rawSubmissionFiles },
    { data: rawPbdbFiles },
    { data: rawPbdrFiles },
    { data: rawReviews },
    { data: rawFileRequirements },
  ] = await Promise.all([
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
      .not("file_type", "in", "(pbdb,pbdr)")
      .order("created_at"),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, version, created_at")
      .eq("project_id", id)
      .eq("file_type", "pbdb")
      .order("version", { ascending: true }),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, version, created_at")
      .eq("project_id", id)
      .eq("file_type", "pbdr")
      .order("version", { ascending: true }),
    supabase
      .from("stakeholder_reviews")
      .select("id, stakeholder_name, stakeholder_email, status, comments, responded_at, review_cycle")
      .eq("project_id", id)
      .order("review_cycle", { ascending: false })
      .order("responded_at", { ascending: true }),
    supabase
      .from("file_requirements")
      .select("slug, name")
      .order("sort_order"),
  ]);

  const fileReqLabelMap = new Map<string, string>(
    (rawFileRequirements ?? []).map((r) => [r.slug as string, r.name as string])
  );

  const [submissionFiles, pbdrFiles] = await Promise.all([
    Promise.all(
      (rawSubmissionFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(f.storage_path as string, 3600);
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
    Promise.all(
      (rawPbdrFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("documents")
          .createSignedUrl(f.storage_path as string, 3600, {
            download: (f.original_filename as string) || true,
          });
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
  ]);

  const pbdbFiles = rawPbdbFiles ?? [];
  const latestPbdb = pbdbFiles[pbdbFiles.length - 1] ?? null;

  type ReviewRow = {
    id: string; stakeholder_name: string; stakeholder_email: string;
    status: string; comments: string | null; responded_at: string | null; review_cycle: number;
  };
  const allReviews = (rawReviews ?? []) as ReviewRow[];
  const reviewsByCycle = new Map<number, ReviewRow[]>();
  for (const r of allReviews) {
    if (!reviewsByCycle.has(r.review_cycle)) reviewsByCycle.set(r.review_cycle, []);
    reviewsByCycle.get(r.review_cycle)!.push(r);
  }
  const reviewCycles = [...reviewsByCycle.keys()].sort((a, b) => b - a);

  const labelMap = new Map<string, string>(
    (mappings ?? []).map((m) => [
      m.placeholder_token as string,
      (m.display_label as string | null) ?? prettifyToken(m.placeholder_token as string),
    ])
  );

  const extractedFields = project.extracted_fields ?? {};

  const clientFieldEntries = Object.entries(extractedFields)
    .filter(([token]) => token.startsWith("EXTRACT_") || token.startsWith("CLIENT_"))
    .map(([token, value]) => ({
      token,
      label: labelMap.get(token) ?? prettifyToken(token),
      value: value as string,
    }));

  const orgConfig = (project.clients?.client_config ?? {}) as Record<string, string>;
  const orgMerged: Record<string, string> = { ...orgConfig };
  for (const [k, v] of Object.entries(extractedFields)) {
    if (k.startsWith("ORG_")) orgMerged[k] = v as string;
  }
  const orgTokenEntries = Object.entries(orgMerged)
    .filter(([k]) => k.startsWith("ORG_"))
    .map(([token, value]) => ({
      token,
      label: labelMap.get(token) ?? prettifyToken(token),
      value: value as string,
    }));

  const fmtDMY = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const latestGenDate = latestPbdb ? new Date(latestPbdb.created_at as string) : null;
  const latestVersion = latestPbdb ? (latestPbdb.version as number) : null;
  const sysValues: { label: string; value: string }[] = [
    {
      label: "Project number",
      value: project.project_number ? `${project.project_number}-S` : "Not yet set",
    },
    { label: "Submission date", value: fmtDMY(new Date(project.created_at)) },
    {
      label: "Generation date",
      value: latestGenDate ? fmtDMY(latestGenDate) : "Not yet generated",
    },
    {
      label: "Revision number",
      value: latestVersion !== null ? String(latestVersion - 1) : "0",
    },
  ];

  const addr = (project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ?? null;
  const title = (project.project_number && addr)
    ? `${project.project_number} — ${addr}`
    : addr ?? (project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8));

  // Step states
  const isTerminal = TERMINAL_STATUSES.has(project.status) || project.status === "converting";
  const step2Locked = !project.project_number;
  const canRegeneratePbdb = (["assigned", "in_progress"] as ProjectStatus[]).includes(project.status);

  const currentCycleReviews = reviewsByCycle.get(project.review_cycle) ?? [];
  const currentCycleComments = currentCycleReviews.filter((r) => r.comments);
  const pendingCount = currentCycleReviews.filter((r) => r.status === "pending").length;

  const pbdbCardState: "locked" | "upload" | "pending" | "revision" | "approved" = !latestPbdb
    ? "locked"
    : project.status === "dispatched"
    ? "pending"
    : project.status === "revision_required"
    ? "revision"
    : isTerminal || project.status === "converting"
    ? "approved"
    : "upload";

  const UPLOAD_NEW_VERSION_COPY =
    "Uploading a new version will reset all stakeholder approvals and resend the approval email with the updated document.";

  const infoContent = (
    <>
      {/* Project summary */}
      <CollapsibleSection title="Project summary" defaultOpen>
        <div className="divide-y divide-zinc-100">
          <Row label="Client" value={project.clients?.name ?? "—"} />
          <Row
            label="Submitted via"
            value={
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                project.source === "email" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
              }`}>
                {project.source === "email" ? "Email" : "Portal"}
              </span>
            }
          />
          <Row label="PO number" value={project.po_number ?? "—"} />
          <Row
            label="Submitted"
            value={new Date(project.created_at).toLocaleDateString("en-AU", {
              day: "numeric", month: "long", year: "numeric",
            })}
          />
          <Row
            label="Expected delivery"
            value={
              project.expected_delivery_date ? (
                <span className={isOverdue ? "font-medium text-red-600" : ""}>
                  {new Date(project.expected_delivery_date).toLocaleDateString("en-AU", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              ) : "—"
            }
          />
        </div>
      </CollapsibleSection>

      {/* Client contact */}
      <CollapsibleSection title="Client contact" defaultOpen>
        <div className="divide-y divide-zinc-100">
          {project.submitter ? (
            <>
              <Row
                label="Name"
                value={
                  [project.submitter.first_name, project.submitter.last_name]
                    .filter(Boolean).join(" ") || "—"
                }
              />
              <Row
                label="Email"
                value={
                  <a href={`mailto:${project.submitter.email}`} className="text-blue-600 hover:underline">
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
              {project.clients?.state_territory && (
                <Row label="State / Territory" value={project.clients.state_territory} />
              )}
            </>
          ) : (
            <div className="px-5 py-4 text-sm text-zinc-400">
              No submitter on record — project may have been submitted via email.
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Submitted details */}
      {clientFieldEntries.length > 0 && (
        <CollapsibleSection title="Submitted details" defaultOpen>
          <div className="divide-y divide-zinc-100">
            {clientFieldEntries.map(({ token, label, value }) => (
              <Row key={token} label={label} value={value || "—"} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Client values */}
      {orgTokenEntries.length > 0 && (
        <CollapsibleSection title="Client values" defaultOpen={false}>
          <div className="divide-y divide-zinc-100">
            {orgTokenEntries.map(({ token, label, value }) => (
              <Row key={token} label={label} value={value || "—"} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* System values */}
      <CollapsibleSection title="System values" defaultOpen={false}>
        <div className="divide-y divide-zinc-100">
          {sysValues.map(({ label, value }) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>
      </CollapsibleSection>

      {/* Submission documents */}
      <CollapsibleSection title="Documents" defaultOpen>
        {submissionFiles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {submissionFiles.map((f) => (
              <DownloadCard
                key={f.id as string}
                href={f.signedUrl}
                originalFilename={f.original_filename as string}
                external
              >
                <p className="text-sm font-medium text-zinc-900">
                  {fileReqLabelMap.get(f.file_type as string) ?? FILE_TYPE_LABELS[f.file_type as string] ?? (f.file_type as string)}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                </p>
              </DownloadCard>
            ))}
          </div>
        )}
        <div className="border-t border-zinc-100 px-5 py-4">
          <FileUploadForm projectId={id} />
        </div>
      </CollapsibleSection>

      {/* Client document colour */}
      {latestPbdb && (
        <CollapsibleSection title="Client document colour" defaultOpen>
          <div className="px-5 py-4">
            <p className="mb-4 text-xs text-zinc-500">
              Controls whether the client receives a version with black text or the original red
              token colour when they download the PBDB via their review link.
            </p>
            <ProjectStripColorToggle projectId={id} initialValue={project.strip_token_color} />
          </div>
        </CollapsibleSection>
      )}

      {/* Stakeholder reviews */}
      {allReviews.length > 0 && (
        <CollapsibleSection
          title="Stakeholder reviews"
          subtitle="All review cycles — each cycle corresponds to one version of the PBDB sent to stakeholders."
          defaultOpen={false}
        >
          {reviewCycles.map((cycle) => {
            const cycleReviews = reviewsByCycle.get(cycle)!;
            const pbdbForCycle = pbdbFiles.find((f) => (f.version as number) === cycle);
            const isCurrent = cycle === project.review_cycle;
            return (
              <div key={cycle} className="border-b border-zinc-100 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2 bg-zinc-50 px-5 py-2.5">
                  <span className="text-xs font-semibold text-zinc-700">Cycle {cycle}</span>
                  {pbdbForCycle ? (
                    <span className="text-xs text-zinc-400">
                      · PBDB v{cycle}
                      · {new Date(pbdbForCycle.created_at as string).toLocaleDateString("en-AU")}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">· PBDB v{cycle}</span>
                  )}
                  {isCurrent && (
                    <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Current
                    </span>
                  )}
                </div>
                <div className="divide-y divide-zinc-50">
                  {cycleReviews.map((r) => {
                    const statusConfig = {
                      pending: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
                      approved_without_comments: { label: "Approved", cls: "bg-green-100 text-green-700" },
                      approved_with_comments: { label: "Approved with notes", cls: "bg-green-100 text-green-700" },
                      rejected_with_comments: { label: "Rejected", cls: "bg-red-100 text-red-700" },
                      waived: { label: "Waived", cls: "bg-zinc-100 text-zinc-500" },
                    }[r.status] ?? { label: r.status, cls: "bg-zinc-100 text-zinc-500" };
                    return (
                      <div key={r.id} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                            <p className="text-xs text-zinc-500">{r.stakeholder_email}</p>
                            {r.comments && (
                              <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{r.comments}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.cls}`}>
                              {statusConfig.label}
                            </span>
                            {r.responded_at && (
                              <p className="mt-0.5 text-xs text-zinc-400">
                                {new Date(r.responded_at).toLocaleDateString("en-AU", {
                                  day: "numeric", month: "short", year: "numeric",
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CollapsibleSection>
      )}

      {/* PBDR */}
      {pbdrFiles.length > 0 && (
        <CollapsibleSection
          title="PBDR"
          subtitle="Final converted document delivered to the client."
          defaultOpen
        >
          <div className="divide-y divide-zinc-100">
            {pbdrFiles.map((f) => (
              <DownloadCard
                key={f.id as string}
                href={f.signedUrl}
                filename={f.original_filename as string}
                originalFilename={f.original_filename as string}
              >
                <p className="text-sm font-medium text-zinc-900">PBDR</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Version {f.version as number} ·{" "}
                  {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                </p>
              </DownloadCard>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );

  const stepsContent = (
    <>
      {/* Step 1: Set project number */}
      <ProjectNumberForm projectId={id} projectNumber={project.project_number} />

      {/* Step 2: Generate PBDB */}
      <div className={`rounded-lg border ${step2Locked ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 last:border-b-0">
          <StepIndicator step={2} completed={false} locked={step2Locked} />
          <h3 className={`text-sm font-semibold ${step2Locked ? "text-zinc-400" : "text-zinc-900"}`}>
            PBDB
          </h3>
        </div>
        {step2Locked ? (
          <p className="px-5 py-4 text-sm text-zinc-400">
            Set the project number first to unlock PBDB generation.
          </p>
        ) : pbdbFiles.length === 0 ? (
          <div className="px-5 py-4">
            <GeneratePbdbButton projectId={id} />
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pbdbFiles.map((f, i) => {
              const version = f.version as number;
              const isLatest = i === pbdbFiles.length - 1;
              const showDispatchedBadge =
                isLatest &&
                (["dispatched", "revision_required"] as ProjectStatus[]).includes(
                  project.status as ProjectStatus
                );
              return (
                <DownloadCard
                  key={f.id as string}
                  id={showDispatchedBadge ? "qa-pbdb-row" : undefined}
                  href={`/api/download/pbdb/${f.id as string}`}
                  filename={f.original_filename as string}
                  wrapperClassName="flex items-center justify-between px-5 py-3 transition-shadow duration-700"
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{f.original_filename as string}</p>
                    {showDispatchedBadge && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Dispatched PBDB
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    v{version} · {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                </DownloadCard>
              );
            })}
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              {canRegeneratePbdb && (
                <p className="text-xs text-zinc-500">
                  Need to fix something? Regenerating creates a new version — existing versions are kept.
                </p>
              )}
              <RegeneratePbdbButton
                projectId={id}
                disabledMessage={
                  canRegeneratePbdb
                    ? undefined
                    : "Regeneration is only available before the PBDB is dispatched to stakeholders."
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Step 3: PBDB completion & approval — transforms through Locked / Upload / Pending / Revision / Approved */}
      <div className={`rounded-lg border ${
        pbdbCardState === "locked"
          ? "border-zinc-200 bg-zinc-50"
          : pbdbCardState === "approved"
          ? "border-green-200 bg-green-50"
          : "border-zinc-200 bg-white"
      }`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 last:border-b-0">
          <StepIndicator step={3} completed={pbdbCardState === "approved"} locked={pbdbCardState === "locked"} />
          <h3 className={`text-sm font-semibold ${
            pbdbCardState === "locked"
              ? "text-zinc-400"
              : pbdbCardState === "approved"
              ? "text-green-800"
              : "text-zinc-900"
          }`}>
            PBDB completion & approval
          </h3>
          {pbdbCardState === "pending" && (
            <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Awaiting {pendingCount} of {currentCycleReviews.length} approvals
            </span>
          )}
          {pbdbCardState === "revision" && (
            <span className="ml-auto shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Revision required
            </span>
          )}
          {pbdbCardState === "approved" && (
            <span className="ml-auto shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {project.status === "converting" ? "Converting…" : "Approved"}
            </span>
          )}
        </div>

        {pbdbCardState === "locked" && (
          <p className="px-5 py-4 text-sm text-zinc-400">
            Waiting for the PBDB to be generated.
          </p>
        )}

        {pbdbCardState === "upload" && (
          <div className="px-5 py-4">
            <PbdbQaUploadForm projectId={id} />
          </div>
        )}

        {pbdbCardState === "pending" && (
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
              <svg className="h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.24a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-blue-700">PBDB dispatched — awaiting stakeholder responses.</p>
            </div>
            <PbdbQaUploadForm
              projectId={id}
              submitLabel="Upload new version"
              requireConfirmation
              confirmCopy={UPLOAD_NEW_VERSION_COPY}
            />
          </div>
        )}

        {pbdbCardState === "revision" && (
          <div className="px-5 py-4 space-y-4">
            {currentCycleComments.length > 0 && (
              <div className="space-y-3">
                {currentCycleComments.map((r) => (
                  <div key={r.id} className="rounded-md border border-red-100 bg-red-50 px-4 py-3">
                    <p className="text-xs font-semibold text-red-800">{r.stakeholder_name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-red-700">{r.comments}</p>
                  </div>
                ))}
              </div>
            )}
            <PbdbQaUploadForm
              projectId={id}
              submitLabel="Upload revised PBDB and re-submit to stakeholders"
              requireConfirmation
              confirmCopy={UPLOAD_NEW_VERSION_COPY}
            />
          </div>
        )}

        {pbdbCardState === "approved" && (
          <div className="px-5 py-4">
            {project.status === "converting" ? (
              <p className="text-xs text-green-700">
                All stakeholders approved — converting to PBDR.
              </p>
            ) : pbdrFiles.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-green-800">PBDR ready for download</p>
                {pbdrFiles.map((f) => (
                  <DownloadCard
                    key={f.id as string}
                    href={f.signedUrl}
                    filename={f.original_filename as string}
                    originalFilename={f.original_filename as string}
                    wrapperClassName="flex items-center justify-between rounded-md border border-green-200 bg-white px-4 py-3"
                    buttonClassName="shrink-0 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
                  >
                    <p className="text-sm font-medium text-zinc-900">PBDR</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      v{f.version as number} · {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                    </p>
                  </DownloadCard>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      {justPickedUp && <PickedUpBanner projectId={id} />}
      {justUploadedQa && <QaUploadedBanner cleanUrl={`/ops/projects/${id}`} />}

      <div>
        <Link href="/ops" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← My projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[project.status]}`}>
            {STATUS_LABELS[project.status]}
          </span>
          {isOverdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Overdue
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout: workflow steps (narrow, left) + project details (wide, right).
          Single column on mobile — steps stack above details. */}
      <div className="consultant-two-col">
        <div className="space-y-3">{stepsContent}</div>
        <div className="space-y-4">{infoContent}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}
