"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { performAssignment } from "@/lib/projects/assign";
import { generatePbdb } from "@/lib/documents/generator";
import { formatAddress } from "@/lib/documents/formatters";
import { notify } from "@/lib/notifications/notify";
import { QaCompleteEmail } from "@/lib/email/templates/QaCompleteEmail";
import { dispatchPbdb } from "@/lib/stakeholders/dispatch";
import { generateTokenString, computeTokenExpiry } from "@/lib/stakeholders/tokens";
import { sendEmail } from "@/lib/email/sender";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";

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

// ─── Upload a file to an existing project ────────────────────────────────────

export type UploadFileState = { error?: string; success?: boolean };

export async function uploadProjectFile(
  projectId: string,
  _prev: UploadFileState,
  formData: FormData
): Promise<UploadFileState> {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  // Verify access based on role
  let query = supabase
    .from("projects")
    .select("id, client_id, assigned_consultant_id, extracted_fields, project_number")
    .eq("id", projectId)
    .is("deleted_at", null);

  if (actor.role === "stakeholder") {
    query = query.eq("client_id", actor.client_id as string);
  } else if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  // Stakeholders can only add documents to their submission while it's unpicked-up —
  // once a consultant has taken the project, the submission is locked.
  if (actor.role === "stakeholder" && project.assigned_consultant_id) {
    return { error: "This project is under review — editing is no longer available." };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 50 * 1024 * 1024) return { error: "File must be under 50 MB." };

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${project.client_id}/${projectId}/additional/${Date.now()}_${file.name}`;

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

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, assigned_consultant_id, extracted_fields, project_number")
    .eq("id", projectId)
    .eq("client_id", actor.client_id as string)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return { error: "Project not found or access denied." };
  if (project.assigned_consultant_id) {
    return { error: "This project is under review — editing is no longer available." };
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
  const storagePath = `${project.client_id}/${projectId}/${existingFile.file_type}/${Date.now()}_${file.name}`;

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

// ─── Stakeholder: edit submitted details + PO number (pre-pickup only) ───────

export type UpdateSubmissionState = { error?: string; success?: boolean };

export async function updateStakeholderSubmission(
  projectId: string,
  _prev: UpdateSubmissionState,
  formData: FormData
): Promise<UpdateSubmissionState> {
  const actor = await requireRole("stakeholder");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, assigned_consultant_id, extracted_fields, po_number, project_number")
    .eq("id", projectId)
    .eq("client_id", actor.client_id as string)
    .is("deleted_at", null)
    .maybeSingle();

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

async function notifyAdminsOfSubmissionEdit(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  project: { extracted_fields: unknown; project_number?: unknown },
  changeSummary: string
) {
  const fields = project.extracted_fields as Record<string, string> | null;
  const projectRef =
    fields?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    projectId.slice(0, 8);

  const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
  if (!admins || admins.length === 0) return;

  await Promise.all(
    admins.map((a) =>
      notify({
        recipientId: a.id as string,
        type: "submission_edited",
        message: `A stakeholder ${changeSummary} for ${projectRef}.`,
        projectId,
        emailSubject: `Submission updated — ${projectRef}`,
        emailHtml: `<p style="font-family:sans-serif">A stakeholder ${changeSummary} for project <strong>${projectRef}</strong>. Review the changes in the admin dashboard.</p>`,
      }).catch(() => {})
    )
  );
}

// ─── Admin: set / override project number and (re-)generate PBDB ─────────────

export type AdminProjectNumberState = { error?: string; success?: boolean };

// Shared core: set number, generate PBDB, advance status, audit log.
// Returns an error string on failure, undefined on success.
async function _applyProjectNumber(
  projectId: string,
  rawNumber: string,
  actorId: string,
  actorEmail: string
): Promise<string | undefined> {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, project_number")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return "Project not found.";

  const previousNumber = project.project_number as string | null;

  const { error: updateError } = await supabase
    .from("projects")
    .update({ project_number: rawNumber })
    .eq("id", projectId);

  if (updateError) return updateError.message;

  try {
    await generatePbdb(projectId, actorId);
  } catch (err) {
    await supabase
      .from("projects")
      .update({ project_number: previousNumber })
      .eq("id", projectId);
    return err instanceof Error ? err.message : "PBDB generation failed. Please try again.";
  }

  const currentStatus = project.status as string;
  if (currentStatus === "submitted" || currentStatus === "assigned") {
    await supabase
      .from("projects")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", projectId);
  }

  await auditLog("project.pbdb_generated", actorId, actorEmail, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      project_number: rawNumber,
      ...(previousNumber && previousNumber !== rawNumber
        ? { previous_number: previousNumber }
        : {}),
      actor: "admin",
    },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/ops/projects/${projectId}`);
}

export async function adminSetProjectNumber(
  projectId: string,
  _prev: AdminProjectNumberState,
  formData: FormData
): Promise<AdminProjectNumberState> {
  const actor = await requireRole("super_admin", "admin");

  const rawNumber = (formData.get("project_number") as string | null)?.trim();
  if (!rawNumber) return { error: "Project number is required." };

  const err = await _applyProjectNumber(projectId, rawNumber, actor.id, actor.email as string);
  if (err) return { error: err };

  redirect(`/admin/projects/${projectId}?number_saved=1`);
}

// Dashboard variant: same work, returns success state instead of redirecting
// so the two-step drawer can advance to the assign step.
export async function adminSetProjectNumberFromDashboard(
  projectId: string,
  _prev: AdminProjectNumberState,
  formData: FormData
): Promise<AdminProjectNumberState> {
  const actor = await requireRole("super_admin", "admin");

  const rawNumber = (formData.get("project_number") as string | null)?.trim();
  if (!rawNumber) return { error: "Project number is required." };

  const err = await _applyProjectNumber(projectId, rawNumber, actor.id, actor.email as string);
  if (err) return { error: err };

  return { success: true };
}

// ─── Consultant: enter project number and trigger PBDB generation ─────────────

export type ProjectNumberState = { error?: string; success?: boolean };

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
  if (project.project_number) return { error: "Project number is already set." };

  const rawNumber = (formData.get("project_number") as string | null)?.trim();
  if (!rawNumber) return { error: "Project number is required." };

  const { error: updateError } = await supabase
    .from("projects")
    .update({ project_number: rawNumber })
    .eq("id", projectId);

  if (updateError) return { error: updateError.message };

  await auditLog("project.number_set", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { project_number: rawNumber },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}`);
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
    .select("id, client_id, status, review_cycle, project_number, extracted_fields")
    .eq("id", projectId)
    .in("status", ["assigned", "in_progress", "revision_required"])
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

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 100 * 1024 * 1024) return { error: "File must be under 100 MB." };
  if (
    !file.name.toLowerCase().endsWith(".docx") &&
    file.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { error: "Only .docx files are accepted for PBDB re-upload." };
  }

  const { data: existing } = await supabase
    .from("project_files")
    .select("version")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version ?? 0) + 1;
  const isRevision = (project.status as string) === "revision_required";
  const cycle = (project.review_cycle as number) ?? 1;

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const projectNum = (project.project_number as string | null) ?? "";
  const rawAddress = ((project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? "").trim();
  const address = formatAddress(rawAddress);
  const uploadDate = new Date();
  const yyyy = uploadDate.getFullYear();
  const mm = String(uploadDate.getMonth() + 1).padStart(2, "0");
  const dd = String(uploadDate.getDate()).padStart(2, "0");

  // R[n] only increments when a stakeholder revision cycle completes.
  // QA corrections stay on the same R[n] as the generated file (review_cycle - 1).
  // Revision uploads advance to the next R[n] (review_cycle), matching the cycle just rejected.
  const rIndex = isRevision ? cycle : cycle - 1;
  const storedFilename = [
    `${projectNum}-S PBDB R${rIndex}`,
    address,
    `${yyyy} ${mm} ${dd}`,
  ].filter(Boolean).join(" ") + ".docx";

  // Revision filenames are unique per cycle (different R[n]); QA correction filenames may
  // collide with the previously generated file, so prefix the storage object with the version
  // counter to guarantee a unique path while keeping original_filename canonical.
  const storageFilename = isRevision ? storedFilename : `v${nextVersion}_${storedFilename}`;
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
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);
    return { error: "Failed to record file. Please try again." };
  }

  const now = new Date().toISOString();

  if (isRevision) {
    await supabase
      .from("projects")
      .update({
        review_cycle: cycle + 1,
        first_response_at: null,
        review_buffer_fired_at: null,
        updated_at: now,
      })
      .eq("id", projectId);

    await auditLog("project.revision_complete", actor.id, actor.email as string, {
      projectId,
      orgId: project.client_id as string,
      metadata: { review_cycle: cycle, version: nextVersion, filename: file.name },
    });

    try {
      await dispatchPbdb(projectId, actor.id);
    } catch (err) {
      return { error: `File uploaded but dispatch failed: ${err instanceof Error ? err.message : "Unknown error"}` };
    }
  } else {
    // Initial QA upload (in_progress) — mark complete, notify admins, dispatch to stakeholders
    await supabase
      .from("projects")
      .update({ qa_completed_by: actor.id, updated_at: now })
      .eq("id", projectId);

    const fields = project.extracted_fields as Record<string, string> | null;
    const projectRef =
      fields?.["EXTRACT_ADDRESS"] ??
      (project.project_number as string | null) ??
      projectId.slice(0, 8);

    const { data: admins } = await supabase.from("users").select("id").eq("role", "super_admin");
    if (admins && admins.length > 0) {
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
          })
        )
      );
    }

    await auditLog("project.qa_complete", actor.id, actor.email as string, {
      projectId,
      orgId: project.client_id as string,
      metadata: { version: nextVersion, filename: file.name, project_ref: projectRef },
    });

    try {
      await dispatchPbdb(projectId, actor.id);
    } catch (err) {
      return { error: `File uploaded but dispatch failed: ${err instanceof Error ? err.message : "Unknown error"}` };
    }
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}?qa_uploaded=1`);
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

  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("role", "super_admin");

  if (admins && admins.length > 0) {
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
        })
      )
    );
  }

  await auditLog("project.qa_complete", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { project_ref: projectRef },
  });

  try {
    await dispatchPbdb(projectId, actor.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dispatch failed. An admin can retry from the project page." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}`);
}

// ─── Consultant: resend updated PBDB while dispatched ────────────────────────

export type ResendPbdbState = { error?: string; success?: boolean };

export async function resendPbdb(
  projectId: string,
  _prev: ResendPbdbState,
  formData: FormData
): Promise<ResendPbdbState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select(
      "id, client_id, status, review_cycle, project_number, extracted_fields, clients(state_territory)"
    )
    .eq("id", projectId)
    .in("status", ["dispatched", "in_progress"])
    .is("deleted_at", null);

  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or not available for resend." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 100 * 1024 * 1024) return { error: "File must be under 100 MB." };
  if (
    !file.name.toLowerCase().endsWith(".docx") &&
    file.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { error: "Only .docx files are accepted." };
  }

  const cycle = (project.review_cycle as number) ?? 1;

  const { data: existing } = await supabase
    .from("project_files")
    .select("version")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = ((existing?.[0]?.version as number | null | undefined) ?? 0) + 1;

  const projectNum = (project.project_number as string | null) ?? "";
  const rawAddress = (
    (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? ""
  ).trim();
  const address = formatAddress(rawAddress);
  const uploadDate = new Date();
  const yyyy = uploadDate.getFullYear();
  const mm = String(uploadDate.getMonth() + 1).padStart(2, "0");
  const dd = String(uploadDate.getDate()).padStart(2, "0");
  const rIndex = cycle - 1;
  const storedFilename =
    [`${projectNum}-S PBDB R${rIndex}`, address, `${yyyy} ${mm} ${dd}`]
      .filter(Boolean)
      .join(" ") + ".docx";
  const storagePath = `${project.client_id as string}/${projectId}/pbdb/v${nextVersion}_${storedFilename}`;

  const fileBuffer = Buffer.from(await file.arrayBuffer());
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
  });
  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);
    return { error: "Failed to record file. Please try again." };
  }

  const { data: reviews } = await supabase
    .from("stakeholder_reviews")
    .select("id, stakeholder_email, stakeholder_name")
    .eq("project_id", projectId)
    .eq("review_cycle", cycle);

  if (!reviews || reviews.length === 0) {
    return { error: "No stakeholder reviews found for this dispatch cycle." };
  }

  const pbdbUrl = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 7 * 24 * 3600)
    .then((r) => r.data?.signedUrl ?? null);

  const stateTerritory =
    (
      project.clients as unknown as { state_territory: string | null } | null
    )?.state_territory ?? null;
  const now = new Date();
  const expiresAt = await computeTokenExpiry(now, stateTerritory);
  const expiresFormatted = expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stakeholderEmails = reviews.map((r) => (r.stakeholder_email as string).toLowerCase());
  const { data: portalUsers } = await supabase
    .from("users")
    .select("id, email, role")
    .in("email", stakeholderEmails);
  const portalUserMap = new Map(
    (portalUsers ?? []).map((u) => [(u.email as string).toLowerCase(), u])
  );

  for (const review of reviews) {
    const token = generateTokenString();
    const email = (review.stakeholder_email as string).toLowerCase();
    const portalUser = portalUserMap.get(email) as
      | { id: string; email: string; role: string }
      | undefined;
    const approvalUrl =
      portalUser?.role === "stakeholder"
        ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/projects/${projectId}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/approve/${token}`;

    await supabase
      .from("stakeholder_reviews")
      .update({
        token,
        expires_at: expiresAt.toISOString(),
        dispatched_at: now.toISOString(),
        fresh_token_sent_at: null,
        status: "pending",
        comments: null,
        responded_at: null,
      })
      .eq("id", review.id as string);

    const emailHtml = renderApprovalRequestEmail({
      stakeholderName: review.stakeholder_name as string,
      projectId: projectId.slice(0, 8),
      approvalUrl,
      expiresAt: expiresFormatted,
      pbdbUrl,
    });

    if (portalUser) {
      await notify({
        recipientId: portalUser.id,
        type: "approval_request",
        message: `An updated PBDB is ready for your review.`,
        projectId,
        emailSubject: `Updated PBDB — approval required (ref: ${projectId.slice(0, 8)})`,
        emailHtml,
      }).catch(() => {});
    } else {
      await sendEmail({
        to: review.stakeholder_email as string,
        subject: `Updated PBDB — approval required (ref: ${projectId.slice(0, 8)})`,
        html: emailHtml,
      }).catch((err) => {
        console.error(`[resend-pbdb] email to ${review.stakeholder_email as string} failed:`, err);
      });
    }
  }

  await auditLog("project.pbdb_resent", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      review_cycle: cycle,
      version: nextVersion,
      stakeholder_count: reviews.length,
    },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}?pbdb_resent=1`);
}

// ─── Super Admin: update project field values ─────────────────────────────────

export type UpdateFieldsState = { error?: string; success?: boolean };

export async function updateProjectFields(
  projectId: string,
  _prev: UpdateFieldsState,
  formData: FormData
): Promise<UpdateFieldsState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, extracted_fields")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return { error: "Project not found." };

  // Merge submitted token values over existing fields
  const existing = (project.extracted_fields as Record<string, string>) ?? {};
  const updated: Record<string, string> = { ...existing };

  for (const [key, rawVal] of formData.entries()) {
    if (
      key.startsWith("EXTRACT_") ||
      key.startsWith("ORG_") ||
      key.startsWith("CLIENT_")
    ) {
      updated[key] = (rawVal as string).trim();
    }
  }

  const { error } = await supabase
    .from("projects")
    .update({ extracted_fields: updated })
    .eq("id", projectId);

  if (error) return { error: error.message };

  await auditLog(
    "project.fields_updated",
    actor.id,
    actor.email as string,
    {
      orgId: project.client_id as string,
      projectId,
      metadata: { updated },
    }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
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
