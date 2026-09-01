"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/auth/project-access";
import { auditLog } from "@/lib/audit/log";
import { performAssignment } from "@/lib/projects/assign";
import { validateProjectNumber, findDuplicateProjectNumber } from "@/lib/projects/project-number";
import { generatePbdb } from "@/lib/documents/generator";
import { formatAddress } from "@/lib/documents/formatters";
import { notify } from "@/lib/notifications/notify";
import { QaCompleteEmail } from "@/lib/email/templates/QaCompleteEmail";
import type { DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";
import { expediteDelivery, expeditePbdbDispatch, scheduleOrDeliverPbdb } from "@/lib/documents/pending-delivery";
import { getCurrentRevNumber } from "@/lib/documents/revision-history";
import { buildPbdbFilename } from "@/lib/documents/naming";
import { appendRevisionHistoryRow, setCoverRevisionNumber } from "@/lib/documents/revision-table";
import { scanDocxStructure } from "@/lib/documents/docx-structure-scan";
import { getOrCreateDispatchPdf, type DispatchPdfProject } from "@/lib/documents/pbdb-pdf";
import { sanitizeFilename } from "@/lib/storage/sanitize-filename";
import { writeProgress } from "@/lib/documents/progress";
import type { SupabaseClient } from "@supabase/supabase-js";

async function notifyAdminsQaComplete(
  supabase: SupabaseClient,
  projectId: string,
  projectRef: string
): Promise<void> {
  const { data: admins } = await supabase.from("users").select("id").eq("role", "super_admin");
  if (!admins || admins.length === 0) return;

  await Promise.all(
    admins.map((admin) =>
      notify({
        recipientId: admin.id as string,
        type: "qa_complete",
        message: `QA complete for ${projectRef} — dispatching to stakeholders now.`,
        projectId,
        emailSubject: `QA complete — ${projectRef}`,
        emailHtml: QaCompleteEmail({
          projectRef,
          portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/projects/${projectId}`,
        }),
      }).catch((err) => console.error(`[notifyAdminsQaComplete] notify failed for ${admin.id}:`, err))
    )
  );
}

export type AssignState = { error?: string; success?: boolean };

export type SelfAssignState = { error?: string; success?: boolean };

export async function selfAssignProject(
  projectId: string,
  _prev: SelfAssignState,
  _formData: FormData
): Promise<SelfAssignState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  // Verify project is still available (submitted, unassigned)
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, assigned_consultant_id")
    .eq("id", projectId)
    .eq("status", "submitted")
    .is("assigned_consultant_id", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) {
    return { error: "This project is no longer available — it may have already been assigned." };
  }

  try {
    await performAssignment(projectId, actor.id, actor.id, actor.email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Assignment failed. Please try again." };
  }

  revalidatePath("/ops");
  redirect(`/ops/projects/${projectId}?picked_up=1`);
}

export async function assignConsultant(
  projectId: string,
  consultantId: string
) {
  const actor = await requireRole("super_admin", "admin");
  await performAssignment(projectId, consultantId, actor.id, actor.email);
}

export async function assignConsultantFromForm(
  projectId: string,
  _prev: AssignState,
  formData: FormData
): Promise<AssignState> {
  const actor = await requireRole("super_admin", "admin");
  const consultantId = formData.get("consultant_id") as string | null;
  if (!consultantId) return { error: "Please select a consultant." };
  try {
    await performAssignment(projectId, consultantId, actor.id, actor.email);
  } catch (err) {
    console.error("[assignConsultantFromForm]", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Assignment failed. Please try again.",
    };
  }
  redirect(`/admin/projects/${projectId}?assigned=1`);
}

export type AcceptDeclineState = { error?: string; success?: boolean };

export async function acceptAssignment(
  projectId: string,
  _prev: AcceptDeclineState,
  _formData: FormData
): Promise<AcceptDeclineState> {
  const actor = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, accepted_at")
    .eq("id", projectId)
    .eq("assigned_consultant_id", actor.id)
    .is("accepted_at", null)
    .maybeSingle();

  if (!project) {
    return { error: "This assignment is no longer awaiting your response." };
  }

  const { error } = await supabase
    .from("projects")
    .update({ accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) return { error: error.message };

  await auditLog("assignment.accepted", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath("/ops");
  redirect(`/ops/projects/${projectId}?picked_up=1`);
}

export async function declineAssignment(
  projectId: string,
  _prev: AcceptDeclineState,
  _formData: FormData
): Promise<AcceptDeclineState> {
  const actor = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, extracted_fields, project_number, po_number, site_address")
    .eq("id", projectId)
    .eq("assigned_consultant_id", actor.id)
    .is("accepted_at", null)
    .maybeSingle();

  if (!project) {
    return { error: "This assignment is no longer awaiting your response." };
  }

  // Undo the "submitted" → "assigned" transition performAssignment made on push,
  // so the project reappears in the unassigned "Available jobs" pool. Only
  // touch status if it's still at that early stage — don't rewind a project
  // that's progressed further (e.g. admin reassigning mid-workflow).
  const revertedStatus = project.status === "assigned" ? "submitted" : project.status;

  const { error } = await supabase
    .from("projects")
    .update({
      assigned_consultant_id: null,
      accepted_at: null,
      status: revertedStatus,
      submission_edit_notified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) return { error: error.message };

  await auditLog("assignment.declined", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
  });

  const fields = project.extracted_fields as Record<string, string> | null;
  const projectRef =
    (project.site_address as string | null) ??
    fields?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    (project.po_number as string | null) ??
    projectId.slice(0, 8);

  const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
  if (admins && admins.length > 0) {
    await Promise.all(
      admins.map((a) =>
        notify({
          recipientId: a.id as string,
          type: "assignment_declined",
          title: "Assignment declined",
          message: `The assignment for ${projectRef} was declined and has returned to the unassigned pool.`,
          projectId,
          emailSubject: `Assignment declined — ${projectRef}`,
          emailHtml: `<p style="font-family:sans-serif">The consultant declined the assignment for project <strong>${projectRef}</strong>. It has returned to the unassigned pool and needs a new consultant.</p>`,
        }).catch(() => {})
      )
    );
  }

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  redirect("/ops?declined=1");
}

// ─── Upload a file to an existing project ────────────────────────────────────

export type UploadFileState = { error?: string; success?: boolean };

export async function uploadProjectFile(
  projectId: string,
  _prev: UploadFileState,
  formData: FormData
): Promise<UploadFileState> {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  // #160: was bare client_id match for a stakeholder, letting any stakeholder
  // in the org edit a colleague's project. Now submitter-or-reviewer, same
  // rule lib/portal/access.ts already applies to the project list pages.
  const project = await requireProjectAccess(supabase, actor, projectId);
  if (!project) return { error: "Project not found or access denied." };

  // Stakeholders can add new documents at any point in the project lifecycle —
  // only replacing an existing pre-assignment document is restricted (see
  // replaceProjectFile).

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 50 * 1024 * 1024) return { error: "File must be under 50 MB." };

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${project.client_id}/${projectId}/additional/${Date.now()}_${sanitizeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("submissions")
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  await supabase.from("project_files").insert({
    project_id: projectId,
    file_type: "additional",
    storage_path: storagePath,
    original_filename: file.name,
    uploaded_by: actor.id,
  });

  if (actor.role === "stakeholder") {
    await auditLog("project.submission_edited", actor.id, actor.email as string, {
      projectId,
      orgId: project.client_id as string,
      metadata: { document_added: file.name },
    });
    await notifyAdminsOfSubmissionEdit(supabase, projectId, project, `added a new document (${file.name})`);
  }

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// ─── Stakeholder: replace a previously uploaded document (pre-pickup only) ───

export type ReplaceFileState = { error?: string; success?: boolean };

export async function replaceProjectFile(
  projectId: string,
  fileId: string,
  _prev: ReplaceFileState,
  formData: FormData
): Promise<ReplaceFileState> {
  const actor = await requireRole("stakeholder");
  const supabase = createAdminClient();

  // #160: was bare client_id match, letting any stakeholder in the org
  // replace a colleague's document. Now submitter-or-reviewer.
  const project = await requireProjectAccess(supabase, actor, projectId);
  if (!project) return { error: "Project not found or access denied." };

  // Once a consultant has been assigned, no existing document — regardless of
  // when it was uploaded — can be replaced. Clients can still add new
  // documents via uploadProjectFile.
  if (project.assigned_consultant_id) {
    return { error: "This project is under review — documents can no longer be replaced." };
  }

  const { data: existingFile } = await supabase
    .from("project_files")
    .select("id, storage_path, file_type, original_filename")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!existingFile) return { error: "Document not found." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 50 * 1024 * 1024) return { error: "File must be under 50 MB." };

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${project.client_id}/${projectId}/${existingFile.file_type}/${Date.now()}_${sanitizeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("submissions")
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const previousFilename = existingFile.original_filename as string;
  const previousStoragePath = existingFile.storage_path as string;

  const { error: updateError } = await supabase
    .from("project_files")
    .update({
      storage_path: storagePath,
      original_filename: file.name,
      uploaded_by: actor.id,
      created_at: new Date().toISOString(),
    })
    .eq("id", fileId);

  if (updateError) {
    await supabase.storage.from("submissions").remove([storagePath]);
    return { error: "Failed to record file. Please try again." };
  }

  await supabase.storage.from("submissions").remove([previousStoragePath]).catch(() => {});

  await auditLog("project.submission_edited", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { document_replaced: { previous: previousFilename, new: file.name } },
  });
  await notifyAdminsOfSubmissionEdit(
    supabase,
    projectId,
    project,
    `replaced "${previousFilename}" with a new document`
  );

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// ─── Admin/consultant: confirm or correct a document's type ─────────────────
//
// Documents attached via inbound email get a file_type *suggestion* (which
// attachment extraction found the PO number in), never a final answer —
// file_type_confirmed starts false and the project's Documents panel shows
// it as needing review until an admin/consultant confirms it here (#101
// follow-up: don't let the AI just set it silently).

export type ConfirmFileTypeState = { error?: string; success?: boolean };

const CONFIRMABLE_FILE_TYPES = ["purchase_order", "building_drawing_plans", "additional"] as const;
type ConfirmableFileType = (typeof CONFIRMABLE_FILE_TYPES)[number];

function isConfirmableFileType(value: string): value is ConfirmableFileType {
  return (CONFIRMABLE_FILE_TYPES as readonly string[]).includes(value);
}

export async function confirmProjectFileType(
  projectId: string,
  fileId: string,
  fileType: string
): Promise<ConfirmFileTypeState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  if (!isConfirmableFileType(fileType)) return { error: "Not a valid document type." };
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, client_id, assigned_consultant_id")
    .eq("id", projectId)
    .is("deleted_at", null);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }
  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  const { data: existingFile } = await supabase
    .from("project_files")
    .select("id, file_type, original_filename")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!existingFile) return { error: "Document not found." };

  const { error: updateError } = await supabase
    .from("project_files")
    .update({ file_type: fileType, file_type_confirmed: true })
    .eq("id", fileId);
  if (updateError) return { error: "Failed to update the document type. Please try again." };

  await auditLog("project.file_type_confirmed", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      file_id: fileId,
      filename: existingFile.original_filename,
      previous_file_type: existingFile.file_type,
      confirmed_file_type: fileType,
    },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// ─── Stakeholder: edit submitted details + PO number (pre-pickup only) ───────

export type UpdateSubmissionState = { error?: string; success?: boolean };

export async function updateStakeholderSubmission(
  projectId: string,
  _prev: UpdateSubmissionState,
  formData: FormData
): Promise<UpdateSubmissionState> {
  const actor = await requireRole("stakeholder");
  const supabase = createAdminClient();

  // #160: was bare client_id match, letting any stakeholder in the org edit
  // a colleague's submitted details. Now submitter-or-reviewer.
  const project = await requireProjectAccess(supabase, actor, projectId);
  if (!project) return { error: "Project not found or access denied." };
  if (project.assigned_consultant_id) {
    return { error: "This project is under review — editing is no longer available." };
  }

  const existingFields = (project.extracted_fields as Record<string, string>) ?? {};
  const updatedFields: Record<string, string> = { ...existingFields };
  const changedTokens: string[] = [];

  for (const [key, rawVal] of formData.entries()) {
    if (key.startsWith("EXTRACT_") || key.startsWith("ORG_") || key.startsWith("CLIENT_")) {
      const newVal = (rawVal as string).trim();
      if ((existingFields[key] ?? "") !== newVal) changedTokens.push(key);
      updatedFields[key] = newVal;
    }
  }

  const rawPo = (formData.get("po_number") as string | null)?.trim() ?? "";
  const newPoNumber = rawPo || null;
  const poChanged = (project.po_number ?? null) !== newPoNumber;

  if (changedTokens.length === 0 && !poChanged) {
    return { error: "No changes were made." };
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      extracted_fields: updatedFields,
      po_number: newPoNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (updateError) return { error: updateError.message };

  await auditLog("project.submission_edited", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      changed_fields: changedTokens,
      ...(poChanged
        ? { previous_po_number: project.po_number, new_po_number: newPoNumber }
        : {}),
    },
  });
  await notifyAdminsOfSubmissionEdit(supabase, projectId, { ...project, extracted_fields: updatedFields }, "edited their submitted details");

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// Fires once per pre-assignment editing window: the first edit sends the
// email and sets submission_edit_notified_at, every subsequent edit in the
// same window is silently skipped. declineAssignment clears the guard
// alongside assigned_consultant_id, so a reopened window can notify again.
async function notifyAdminsOfSubmissionEdit(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  project: { extracted_fields: unknown; project_number?: unknown },
  changeSummary: string
) {
  const { data: current } = await supabase
    .from("projects")
    .select("submission_edit_notified_at")
    .eq("id", projectId)
    .maybeSingle();
  if (current?.submission_edit_notified_at) return;

  const fields = project.extracted_fields as Record<string, string> | null;
  const projectRef =
    fields?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    projectId.slice(0, 8);

  const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
  if (!admins || admins.length === 0) return;

  await supabase
    .from("projects")
    .update({ submission_edit_notified_at: new Date().toISOString() })
    .eq("id", projectId);

  await Promise.all(
    admins.map((a) =>
      notify({
        recipientId: a.id as string,
        type: "submission_edited",
        title: "Submission edited",
        message: `A stakeholder ${changeSummary} for ${projectRef}; more changes may follow before pickup.`,
        projectId,
        emailSubject: `Submission updated — ${projectRef}`,
        emailHtml: `<p style="font-family:sans-serif">A stakeholder ${changeSummary} for project <strong>${projectRef}</strong>, and may make further changes before it's picked up. Review the current state in the admin dashboard.</p>`,
      }).catch(() => {})
    )
  );
}

// ─── Admin: set / override project number ─────────────────────────────────

export type AdminProjectNumberState = { error?: string; success?: boolean; warning?: string };

// Shared core: validate + set number, audit log. PBDB generation is a
// separate, manual step (see generatePbdbForProject) — this no longer
// triggers it. Returns `{ error }` on failure, `{ warning }` on success when
// the (permitted) number duplicates another live project.
async function _applyProjectNumber(
  projectId: string,
  rawNumber: string,
  actorId: string,
  actorEmail: string
): Promise<{ error?: string; warning?: string }> {
  const supabase = createAdminClient();

  const validation = validateProjectNumber(rawNumber);
  if (!validation.ok) return { error: validation.error };
  const projectNumber = validation.value;

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, project_number")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return { error: "Project not found." };

  const previousNumber = project.project_number as string | null;

  const { error: updateError } = await supabase
    .from("projects")
    .update({ project_number: projectNumber })
    .eq("id", projectId);

  if (updateError) return { error: updateError.message };

  await auditLog("project.number_set", actorId, actorEmail, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      project_number: projectNumber,
      ...(previousNumber && previousNumber !== projectNumber
        ? { previous_number: previousNumber }
        : {}),
      actor: "admin",
    },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/ops/projects/${projectId}`);

  const duplicate = await findDuplicateProjectNumber(supabase, projectNumber, projectId);
  return duplicate
    ? { warning: `Heads up — project number ${projectNumber} is already used by another live project (${duplicate.label}). Project numbers aren't unique; double-check the site address.` }
    : {};
}

export async function adminSetProjectNumber(
  projectId: string,
  _prev: AdminProjectNumberState,
  formData: FormData
): Promise<AdminProjectNumberState> {
  const actor = await requireRole("super_admin", "admin");

  const result = await _applyProjectNumber(
    projectId,
    (formData.get("project_number") as string | null) ?? "",
    actor.id,
    actor.email as string
  );
  if (result.error) return { error: result.error };

  // Non-blocking duplicate warning must survive back to the form, so this
  // path returns success state (the form shows its own confirmation +
  // warning) rather than redirecting to the ?number_saved=1 banner.
  return { success: true, warning: result.warning };
}

// Dashboard variant: same work, returns success state instead of redirecting
// so the two-step drawer can advance to the assign step.
export async function adminSetProjectNumberFromDashboard(
  projectId: string,
  _prev: AdminProjectNumberState,
  formData: FormData
): Promise<AdminProjectNumberState> {
  const actor = await requireRole("super_admin", "admin");

  const result = await _applyProjectNumber(
    projectId,
    (formData.get("project_number") as string | null) ?? "",
    actor.id,
    actor.email as string
  );
  if (result.error) return { error: result.error };

  return { success: true, warning: result.warning };
}

// ─── Consultant: set / edit project number ─────────────────────────────────

export type ProjectNumberState = { error?: string; success?: boolean; warning?: string };

export async function saveProjectNumber(
  projectId: string,
  _prev: ProjectNumberState,
  formData: FormData
): Promise<ProjectNumberState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, client_id, project_number")
    .eq("id", projectId)
    .is("deleted_at", null);

  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  const previousNumber = project.project_number as string | null;

  const validation = validateProjectNumber((formData.get("project_number") as string | null) ?? "");
  if (!validation.ok) return { error: validation.error };
  const projectNumber = validation.value;

  const { error: updateError } = await supabase
    .from("projects")
    .update({ project_number: projectNumber })
    .eq("id", projectId);

  if (updateError) return { error: updateError.message };

  await auditLog("project.number_set", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      project_number: projectNumber,
      ...(previousNumber && previousNumber !== projectNumber
        ? { previous_number: previousNumber }
        : {}),
    },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);

  // No redirect/banner — the "Right now" Focus card advances to "Generate the
  // PBDB" on its own the moment project_number is set (server-state-driven,
  // same principle as the PBDB-download step), so the old toast/spotlight
  // targeting #pbdb-section was redundant. See pbdb-feedback-focus-step memory.
  const duplicate = await findDuplicateProjectNumber(supabase, projectNumber, projectId);
  return duplicate
    ? {
        success: true,
        warning: `Heads up — project number ${projectNumber} is already used by another live project (${duplicate.label}). Project numbers aren't unique; double-check the site address.`,
      }
    : { success: true };
}

// ─── Consultant: edit project details (submitted details, PO, org values, project number) ──
//
// Org value ("ORG_"-prefixed) edits here are written into this project's own
// extracted_fields, never into clients.client_config — so they override the
// org's global config for this project only, per issue #38.

export type UpdateProjectDetailsState = { error?: string; success?: boolean; warning?: string };

export async function updateProjectDetails(
  projectId: string,
  _prev: UpdateProjectDetailsState,
  formData: FormData
): Promise<UpdateProjectDetailsState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, client_id, extracted_fields, po_number, project_number")
    .eq("id", projectId)
    .is("deleted_at", null);

  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  const existingFields = (project.extracted_fields as Record<string, string>) ?? {};
  const updatedFields: Record<string, string> = { ...existingFields };
  const changedTokens: string[] = [];

  for (const [key, rawVal] of formData.entries()) {
    if (key.startsWith("EXTRACT_") || key.startsWith("ORG_") || key.startsWith("CLIENT_")) {
      const newVal = (rawVal as string).trim();
      if ((existingFields[key] ?? "") !== newVal) changedTokens.push(key);
      updatedFields[key] = newVal;
    }
  }

  // Fields are edited one at a time (see ProjectDetailsEditor), so a field
  // absent from the submission means "not this one" — not "clear it".
  const poProvided = formData.has("po_number");
  const rawPo = (formData.get("po_number") as string | null)?.trim() ?? "";
  const newPoNumber = poProvided ? rawPo || null : (project.po_number as string | null);
  const poChanged = poProvided && (project.po_number ?? null) !== newPoNumber;

  // Project number stays required once set (it gates PBDB generation), so a
  // blank submission here leaves it untouched rather than clearing it.
  const rawProjectNumber = (formData.get("project_number") as string | null)?.trim() ?? "";
  const newProjectNumber = rawProjectNumber || (project.project_number as string | null);
  const projectNumberChanged = (project.project_number ?? null) !== newProjectNumber;

  // Validate only a genuine change — an unrelated edit must not re-run the
  // six-digit check against a grandfathered legacy number, and we omit
  // project_number from the UPDATE entirely when unchanged so the NOT VALID
  // DB constraint never re-inspects a legacy row.
  if (projectNumberChanged) {
    const validation = validateProjectNumber(newProjectNumber);
    if (!validation.ok) return { error: validation.error };
  }

  if (changedTokens.length === 0 && !poChanged && !projectNumberChanged) {
    return { error: "No changes were made." };
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      extracted_fields: updatedFields,
      po_number: newPoNumber,
      ...(projectNumberChanged ? { project_number: newProjectNumber } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (updateError) return { error: updateError.message };

  await auditLog("project.details_edited", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      changed_fields: changedTokens,
      ...(poChanged
        ? { previous_po_number: project.po_number, new_po_number: newPoNumber }
        : {}),
      ...(projectNumberChanged
        ? { previous_number: project.project_number, new_number: newProjectNumber }
        : {}),
    },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);

  if (projectNumberChanged && newProjectNumber) {
    const duplicate = await findDuplicateProjectNumber(supabase, newProjectNumber, projectId);
    if (duplicate) {
      return {
        success: true,
        warning: `Heads up — project number ${newProjectNumber} is already used by another live project (${duplicate.label}). Project numbers aren't unique; double-check the site address.`,
      };
    }
  }
  return { success: true };
}

// ─── Consultant / Admin / Super Admin: manual PBDB generation ────────────────
//
// Replaces the old auto-generation-on-number-save flow. First call generates
// v1; subsequent calls ("Regenerate") create a new version and keep the rest.
// Regeneration is blocked once the PBDB has been dispatched to stakeholders —
// past that point project_files.version is also used to match files to
// review cycles, and a template regeneration would desync the two.

const PBDB_REGENERATE_STATUSES = ["assigned", "in_progress"] as const;

export type GeneratePbdbState = { error?: string; success?: boolean };

export async function generatePbdbForProject(
  projectId: string,
  redirectBasePath: string,
  _prev: GeneratePbdbState,
  _formData: FormData
): Promise<GeneratePbdbState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, client_id, project_number, status")
    .eq("id", projectId)
    .is("deleted_at", null);

  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };
  if (!project.project_number) return { error: "Project number must be set before generating the PBDB." };

  // #114: server-side backstop for the Focus Card's flag-review gate — a
  // consultant may accept a job with open flags, but progressing it into
  // PBDB work requires every flag acknowledged first, regardless of what
  // the UI currently shows.
  const { count: unacknowledgedCount } = await supabase
    .from("field_flags")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .is("consultant_acknowledged_at", null);
  if ((unacknowledgedCount ?? 0) > 0) {
    return { error: "Please review and acknowledge all flagged fields before generating the PBDB." };
  }

  const { data: existingPbdbs } = await supabase
    .from("project_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .limit(1);

  const isRegenerate = (existingPbdbs?.length ?? 0) > 0;
  const status = project.status as string;

  if (isRegenerate && !PBDB_REGENERATE_STATUSES.includes(status as (typeof PBDB_REGENERATE_STATUSES)[number])) {
    return { error: "The PBDB can no longer be regenerated once it has been dispatched to stakeholders." };
  }

  try {
    await generatePbdb(projectId, actor.id);
  } catch (err) {
    await writeProgress(supabase, projectId, null);
    return { error: err instanceof Error ? err.message : "PBDB generation failed. Please try again." };
  }

  if (!isRegenerate && (status === "submitted" || status === "assigned")) {
    await supabase
      .from("projects")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", projectId);
  }

  await auditLog(isRegenerate ? "project.pbdb_regenerated" : "project.pbdb_generated", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { actor: actor.role },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);

  // Consultant workspace: no redirect/banner. The "Right now" Focus card now
  // shows a durable, server-state-driven "Download the generated PBDB" step
  // (gated on projects.pbdb_downloaded_at) that RealtimeRefresh reconciles into
  // place — replacing the old ?pbdb_generated=1 toast/spotlight that raced the
  // revalidatePath() above. The admin project page has no Focus card, so it
  // keeps the first-generation banner via the redirect below.
  if (!isRegenerate && redirectBasePath.startsWith("/admin")) {
    redirect(`${redirectBasePath}?pbdb_generated=1`);
  }
  return { success: true };
}

// ─── Consultant: mark the freshly generated PBDB as downloaded ───────────────
//
// The "Right now" Focus card advances from "Download the generated PBDB" to
// "Upload QA'd PBDB" the instant projects.pbdb_downloaded_at is set. The
// actual file download is a plain <a href> to /api/download/pbdb/[fileId]
// (GeneratedPbdbDownload.tsx) — that GET route already sets the flag and
// audit-logs project.pbdb_downloaded, but driving the Focus-card advance off
// that alone means waiting on RealtimeRefresh to notice the row change, which
// isn't reliable/prompt (RLS on realtime UPDATEs, or no realtime at all
// locally → slow poll fallback). This action runs alongside the anchor click
// purely to revalidatePath deterministically. Idempotent — the GET route's
// own IS NULL guard means it's fine if both race to set the timestamp; no
// second audit log is written here to avoid double-logging one download.

export type MarkPbdbDownloadedState = { error?: string };

export async function markPbdbDownloaded(
  projectId: string,
  fileId: string
): Promise<MarkPbdbDownloadedState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .is("deleted_at", null);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  const { data: file } = await supabase
    .from("project_files")
    .select("id")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .maybeSingle();
  if (!file) return { error: "PBDB file not found." };

  await supabase
    .from("projects")
    .update({ pbdb_downloaded_at: new Date().toISOString() })
    .eq("id", projectId)
    .is("pbdb_downloaded_at", null);

  revalidatePath(`/ops/projects/${projectId}`);
  return {};
}

// ─── Consultant: re-upload corrected PBDB after QA ───────────────────────────

export type UploadQaPbdbState = { error?: string; success?: boolean };

export async function uploadQaPbdb(
  projectId: string,
  _prev: UploadQaPbdbState,
  formData: FormData
): Promise<UploadQaPbdbState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select(
      "id, client_id, status, review_cycle, project_number, extracted_fields, first_response_at, review_buffer_fired_at, clients(revision_notes_required)"
    )
    .eq("id", projectId)
    .in("status", ["assigned", "in_progress", "revision_required", "dispatched"])
    .is("deleted_at", null);

  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or not in progress." };

  // If the project is still "assigned" (e.g. admin generated the PBDB before assigning),
  // advance it to "in_progress" now so dispatch can proceed normally.
  if ((project.status as string) === "assigned") {
    await supabase
      .from("projects")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    project.status = "in_progress";
  }

  const originStatus = project.status as string;
  const isReupload = originStatus === "revision_required" || originStatus === "dispatched";
  const cycle = (project.review_cycle as number) ?? 1;

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 100 * 1024 * 1024) return { error: "File must be under 100 MB." };
  if (
    !file.name.toLowerCase().endsWith(".docx") &&
    file.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { error: "Only .docx files are accepted for PBDB re-upload." };
  }

  const revisionNote = ((formData.get("revision_note") as string | null) ?? "").trim();
  const revisionNotesRequired =
    (project.clients as unknown as { revision_notes_required: boolean } | null)?.revision_notes_required ?? false;
  if (isReupload && revisionNotesRequired && !revisionNote) {
    return { error: "This client requires a note describing what changed on every revision." };
  }

  const { data: existing } = await supabase
    .from("project_files")
    .select("version")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version ?? 0) + 1;

  let fileBuffer = Buffer.from(await file.arrayBuffer());

  const projectNum = (project.project_number as string | null) ?? "";
  const rawAddress = ((project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? "").trim();
  const address = formatAddress(rawAddress);
  const uploadDate = new Date();

  // Rev{n} derives from revision_history's PBDB counter (#108/#109), not
  // review_cycle. A genuine post-rejection reupload already has its new
  // "rejected" row recorded at rejection time (see submitApproval /
  // logStakeholderResponseOnBehalf), so the counter here is already current;
  // a forced resend (isReupload with no rejection) or a plain QA correction
  // leaves the counter untouched, matching the file it's replacing.
  const expectedRev = await getCurrentRevNumber(supabase, projectId, "pbdb");

  // Re-uploads are never re-rendered through docxtemplater (that would wipe
  // the consultant's manual edits), so the Revision History table baked in
  // at the project's original generation never grows on its own. Patch the
  // new row in directly — idempotent, so a forced resend with an unchanged
  // rev counter is a safe no-op (see appendRevisionHistoryRow).
  if (isReupload) {
    const { data: revHistoryRow } = await supabase
      .from("revision_history")
      .select("prepared_by, created_at")
      .eq("project_id", projectId)
      .eq("doc_type", "pbdb")
      .eq("rev_number", expectedRev)
      .maybeSingle();

    let preparedByName = "";
    if (revHistoryRow?.prepared_by) {
      const { data: preparedByUser } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", revHistoryRow.prepared_by as string)
        .maybeSingle();
      preparedByName = [preparedByUser?.first_name as string | null, preparedByUser?.last_name as string | null]
        .filter(Boolean)
        .join(" ");
    }

    const rowDate = revHistoryRow?.created_at
      ? new Date(revHistoryRow.created_at as string)
      : uploadDate;

    fileBuffer = Buffer.from(
      appendRevisionHistoryRow(fileBuffer, {
        docType: "PBDB",
        revNumber: String(expectedRev),
        date: rowDate.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" }),
        purpose: "Stakeholder Review",
        preparedBy: preparedByName,
      })
    );

    // The cover page's scalar Revision value (SYS_REV_NO) is subject to the
    // same frozen-at-initial-generation problem as the table above — patch
    // it to match. Always safe to re-run: it unconditionally sets the cell
    // to expectedRev rather than appending, so a forced resend with an
    // unchanged rev just writes the same value again.
    fileBuffer = Buffer.from(setCoverRevisionNumber(fileBuffer, String(expectedRev)));
  }

  const storedFilename = buildPbdbFilename(projectNum, expectedRev, address, uploadDate, {
    forQa: true,
  });

  // Soft mismatch check (#109) — never blocks the upload, just flags the
  // reason to the consultant so they can double-check they uploaded the
  // right file.
  const filenameMismatchReason = (() => {
    const m = /PBDB\s*Rev\s*(\d+)/i.exec(file.name);
    if (!m) return `Expected a PBDB filename (e.g. "...PBDB Rev${expectedRev}..."), got "${file.name}".`;
    const gotRev = Number(m[1]);
    if (gotRev !== expectedRev) {
      return `Filename says Rev${gotRev}, but the project's current PBDB revision is Rev${expectedRev}.`;
    }
    return null;
  })();

  // Deterministic structural scan (#112) — no AI call, pure XML parsing.
  // Findings are reported to the consultant as a plain list; nothing is
  // auto-stripped, and the consultant is expected to go clean up the source
  // Word doc and re-upload if any of these are real issues.
  const structureScanFindings = scanDocxStructure(fileBuffer);

  // Reupload filenames are unique per cycle (different Rev{n}); QA correction filenames may
  // collide with the previously generated file, so prefix the storage object with the version
  // counter to guarantee a unique path while keeping original_filename canonical.
  const storageFilename = isReupload ? storedFilename : `v${nextVersion}_${storedFilename}`;
  const storagePath = `${project.client_id}/${projectId}/pbdb/${storageFilename}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, fileBuffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { error: insertError } = await supabase.from("project_files").insert({
    project_id: projectId,
    file_type: "pbdb",
    storage_path: storagePath,
    original_filename: storedFilename,
    uploaded_by: actor.id,
    version: nextVersion,
    // A reupload's docx is the corrected version for the *next* cycle (about to be
    // redispatched); an initial QA correction stays on the current cycle.
    review_cycle: isReupload ? cycle + 1 : cycle,
    filename_mismatch_reason: filenameMismatchReason,
    structure_scan_findings: structureScanFindings.length > 0 ? structureScanFindings : null,
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);
    return { error: "Failed to record file. Please try again." };
  }

  const now = new Date().toISOString();

  if (isReupload) {
    await supabase
      .from("projects")
      .update({
        review_cycle: cycle + 1,
        first_response_at: null,
        review_buffer_fired_at: null,
        updated_at: now,
      })
      .eq("id", projectId);

    if (revisionNote) {
      await supabase.from("revision_notes").insert({
        project_id: projectId,
        review_cycle: cycle + 1,
        note: revisionNote,
        created_by: actor.id,
      });
    }

    await auditLog(
      originStatus === "revision_required" ? "project.revision_complete" : "project.pbdb_resent",
      actor.id,
      actor.email as string,
      {
        projectId,
        orgId: project.client_id as string,
        metadata: { review_cycle: cycle, version: nextVersion, filename: file.name },
      }
    );

    // Redispatch is a deliberate separate step now (dispatchToStakeholders /
    // DispatchButton), same "pick delivery timing, then click" pattern as the
    // initial dispatch — this no longer auto-sends to every stakeholder
    // (including non-responders) as a side effect of the upload. The bumped
    // review_cycle above has no stakeholder_reviews rows yet, which is what
    // the "ready to redispatch" Focus Card state is derived from.
  } else {
    // Initial QA upload (in_progress) — mark complete, notify admins. Dispatch
    // is a deliberate separate step now (dispatchToStakeholders / DispatchButton),
    // mirroring the PBDR "pick delivery timing, then click" pattern — this no
    // longer auto-schedules a dispatch as a side effect of the upload.
    await supabase
      .from("projects")
      .update({ qa_completed_by: actor.id, updated_at: now })
      .eq("id", projectId);

    const fields = project.extracted_fields as Record<string, string> | null;
    const projectRef =
      fields?.["EXTRACT_ADDRESS"] ??
      (project.project_number as string | null) ??
      projectId.slice(0, 8);

    await notifyAdminsQaComplete(supabase, projectId, projectRef);

    await auditLog("project.qa_complete", actor.id, actor.email as string, {
      projectId,
      orgId: project.client_id as string,
      metadata: { version: nextVersion, filename: file.name, project_ref: projectRef },
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}?qa_uploaded=1`);
}

// ─── Consultant: acknowledge PBDB QA flags before send (#112) ───────────────

export type AcknowledgePbdbQaFlagsState = { error?: string; ok?: boolean };

/**
 * Soft-block gate between upload and send: a consultant must acknowledge a
 * pbdb file's structure-scan findings before Send unlocks. Scoped to the
 * specific project_files row (one per upload/version) so a fresh re-upload's
 * findings are never covered by a prior version's acknowledgment.
 *
 * The filename-mismatch reason is deliberately NOT part of this gate — the
 * stored/dispatched filename is always system-generated from the current
 * Rev number (buildPbdbFilename), never the uploaded file's own name, so a
 * mismatch there carries no risk to what stakeholders receive.
 */
export async function acknowledgePbdbQaFlags(
  projectId: string,
  fileId: string
): Promise<AcknowledgePbdbQaFlagsState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }
  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  const { data: file } = await supabase
    .from("project_files")
    .select("id")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .maybeSingle();
  if (!file) return { error: "PBDB file not found." };

  await supabase
    .from("project_files")
    .update({ qa_flags_acknowledged_at: new Date().toISOString(), qa_flags_acknowledged_by: actor.id })
    .eq("id", fileId);

  revalidatePath(`/ops/projects/${projectId}`);
  return { ok: true };
}

// ─── Consultant: preview the converted PBDB PDF before send (#112) ─────────

export type PbdbPreviewResult = { error: string } | { url: string; filename: string };

/**
 * Lazily generates (or reuses the cached) dispatch PDF for the project's
 * current review cycle and returns a signed URL for the shared viewer
 * (#104). Deliberately not computed eagerly at page-render time — the
 * consultant may replace an uploaded file before ever previewing it, and
 * conversion has a real cost.
 */
export async function getPbdbPreviewUrl(projectId: string): Promise<PbdbPreviewResult> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, client_id, review_cycle, strip_token_color, project_number, extracted_fields")
    .eq("id", projectId)
    .is("deleted_at", null);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }
  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  let pdf;
  try {
    pdf = await getOrCreateDispatchPdf(
      supabase,
      project as unknown as DispatchPdfProject,
      actor.id
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate preview." };
  }
  if (!pdf) return { error: "No PBDB uploaded yet for this cycle." };

  const { data: signed, error: signErr } = await supabase.storage
    .from("documents")
    .createSignedUrl(pdf.storagePath, 3600);
  if (signErr || !signed) return { error: "Failed to sign preview URL." };

  return { url: signed.signedUrl, filename: pdf.originalFilename };
}

// ─── Consultant: mark QA complete ────────────────────────────────────────────

export type MarkQaCompleteState = { error?: string; success?: boolean };

export async function markQaComplete(
  projectId: string,
  _prev: MarkQaCompleteState,
  _formData: FormData
): Promise<MarkQaCompleteState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, client_id, status, project_number, site_address, extracted_fields")
    .eq("id", projectId)
    .eq("status", "in_progress")
    .is("deleted_at", null);

  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or not in progress." };

  const { data: qaFile } = await supabase
    .from("project_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .gte("version", 2)
    .limit(1)
    .maybeSingle();

  if (!qaFile) {
    return {
      error:
        "Please re-upload the corrected PBDB before marking QA complete.",
    };
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({ qa_completed_by: actor.id, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (updateError) return { error: updateError.message };

  const fields = project.extracted_fields as Record<string, string> | null;
  const projectRef =
    (project.site_address as string | null) ??
    fields?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    projectId.slice(0, 8);

  await notifyAdminsQaComplete(supabase, projectId, projectRef);

  await auditLog("project.qa_complete", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { project_ref: projectRef },
  });

  try {
    await scheduleOrDeliverPbdb(projectId, actor.id, actor.email as string);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dispatch failed. An admin can retry from the project page." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}`);
}

// ─── Admin: soft-delete any project ──────────────────────────────────────────

export async function adminDeleteProject(
  projectId: string
): Promise<{ error?: string }> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, deleted_at")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return { error: "Project not found." };
  if (project.deleted_at) return { error: "Project is already in the recovery bin." };

  // Admins and super admins can soft-delete a project at any stage, including
  // once a consultant has been assigned. The delete is reversible (30-day
  // recovery bin), and status_at_deletion is captured in the audit log below.

  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) return { error: error.message };

  await auditLog("project.admin_deleted", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { status_at_deletion: project.status },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  revalidatePath("/admin/recovery");
  return {};
}

// ─── Admin: pause / resume ────────────────────────────────────────────────────

export type PauseState = { error?: string; success?: boolean };

export async function pauseProject(
  projectId: string,
  _prev: PauseState,
  formData: FormData
): Promise<PauseState> {
  const actor = await requireRole("super_admin", "admin");
  const reason = (formData.get("reason") as string | null)?.trim() ?? "";
  if (!reason) return { error: "A reason is required to pause a project." };

  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, deleted_at")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return { error: "Project not found." };
  if (project.status === "paused") return { error: "Project is already paused." };
  if (["delivered", "complete"].includes(project.status as string))
    return { error: "Delivered and completed projects cannot be paused." };

  const { error } = await supabase
    .from("projects")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
      paused_previous_status: project.status,
      pause_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) return { error: error.message };

  await auditLog("project.paused", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { previous_status: project.status, reason },
  });

  redirect(`/admin/projects/${projectId}?paused=1`);
}

export async function resumeProject(
  projectId: string,
  _prev: PauseState,
  _formData: FormData
): Promise<PauseState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, paused_at, paused_previous_status, expected_delivery_date")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return { error: "Project not found." };
  if (project.status !== "paused") return { error: "Project is not currently paused." };

  const previousStatus = (project.paused_previous_status as string | null) ?? "submitted";

  // Push the delivery date forward by the number of calendar days spent paused
  let newDeliveryDate: string | null = project.expected_delivery_date as string | null;
  if (newDeliveryDate && project.paused_at) {
    const pausedMs = Date.now() - new Date(project.paused_at as string).getTime();
    const pausedDays = Math.ceil(pausedMs / (1000 * 60 * 60 * 24));
    const current = new Date(newDeliveryDate);
    current.setDate(current.getDate() + pausedDays);
    newDeliveryDate = current.toISOString().slice(0, 10);
  }

  const { error } = await supabase
    .from("projects")
    .update({
      status: previousStatus,
      paused_at: null,
      paused_previous_status: null,
      ...(newDeliveryDate ? { expected_delivery_date: newDeliveryDate } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) return { error: error.message };

  await auditLog("project.resumed", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      restored_to_status: previousStatus,
      delivery_date_extended_to: newDeliveryDate,
    },
  });

  redirect(`/admin/projects/${projectId}?resumed=1`);
}

export type SetStripTokenColorState = { error?: string };

export async function setProjectStripTokenColor(
  projectId: string,
  strip: boolean
): Promise<SetStripTokenColorState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase.from("projects").update({ strip_token_color: strip }).eq("id", projectId);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

export type ExpediteDeliveryState = {
  error?: string;
  delivered?: boolean;
  scheduledFor?: string | null;
};

export async function expediteProjectDelivery(projectId: string): Promise<ExpediteDeliveryState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  if (actor.role === "consultant") {
    const { data: project } = await supabase
      .from("projects")
      .select("assigned_consultant_id")
      .eq("id", projectId)
      .single();
    if (project?.assigned_consultant_id !== actor.id) {
      return { error: "You are not assigned to this project." };
    }
  }

  const { data: pending } = await supabase
    .from("pending_deliveries")
    .select("scheduled_for")
    .eq("project_id", projectId)
    .eq("delivery_type", "pbdr")
    .maybeSingle();

  if (!pending) {
    return { error: "No delivery is currently pending for this project." };
  }

  const result = await expediteDelivery(projectId, actor.id, actor.email as string);

  await auditLog("pbdr.delivery_expedited", actor.id, actor.email as string, {
    projectId,
    metadata: {
      previously_scheduled_for: pending.scheduled_for,
      delivered_immediately: result.delivered,
      rescheduled_for: result.scheduledFor,
    },
  });

  if (!result.delivered && !result.scheduledFor && result.reason) {
    return { error: result.reason };
  }

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { delivered: result.delivered, scheduledFor: result.scheduledFor };
}

// #170: bring a staged (normal/extended) PBDB dispatch forward. A PBDB
// dispatch is a reviewer notification with no business-hours gate, so this
// always sends immediately.
export async function expediteProjectPbdbDispatch(projectId: string): Promise<ExpediteDeliveryState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  if (actor.role === "consultant") {
    const { data: project } = await supabase
      .from("projects")
      .select("assigned_consultant_id")
      .eq("id", projectId)
      .single();
    if (project?.assigned_consultant_id !== actor.id) {
      return { error: "You are not assigned to this project." };
    }
  }

  const { data: pending } = await supabase
    .from("pending_deliveries")
    .select("scheduled_for")
    .eq("project_id", projectId)
    .eq("delivery_type", "pbdb")
    .maybeSingle();

  if (!pending) {
    return { error: "No PBDB dispatch is currently scheduled for this project." };
  }

  try {
    await expeditePbdbDispatch(projectId, actor.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dispatch failed." };
  }

  await auditLog("pbdb.dispatch_expedited", actor.id, actor.email as string, {
    projectId,
    metadata: { previously_scheduled_for: pending.scheduled_for },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { delivered: true, scheduledFor: null };
}

export type SetDeliveryDelayPresetState = { error?: string };

export async function setProjectDeliveryDelayPreset(
  projectId: string,
  preset: DeliveryDelayPreset
): Promise<SetDeliveryDelayPresetState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .update({ delivery_delay_preset: preset })
    .eq("id", projectId);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}

// Independent PBDB dispatch delay control (#110) — separate column/preset
// from the PBDR-only setProjectDeliveryDelayPreset above.
export async function setProjectPbdbDeliveryDelayPreset(
  projectId: string,
  preset: DeliveryDelayPreset
): Promise<SetDeliveryDelayPresetState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .update({ pbdb_delivery_delay_preset: preset })
    .eq("id", projectId);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return {};
}
