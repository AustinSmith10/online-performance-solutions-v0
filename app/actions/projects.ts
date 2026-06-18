"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { performAssignment } from "@/lib/projects/assign";
import { generatePbdb } from "@/lib/documents/generator";
import { notify } from "@/lib/notifications/notify";
import { QaCompleteEmail } from "@/lib/email/templates/QaCompleteEmail";

export type AssignState = { error?: string; success?: boolean };

export async function assignConsultant(
  projectId: string,
  consultantId: string
) {
  const actor = await requireRole("super_admin");
  await performAssignment(projectId, consultantId, actor.id, actor.email);
}

export async function assignConsultantFromForm(
  projectId: string,
  _prev: AssignState,
  formData: FormData
): Promise<AssignState> {
  const actor = await requireRole("super_admin");
  const consultantId = formData.get("consultant_id") as string | null;
  if (!consultantId) return { error: "Please select a consultant." };
  try {
    await performAssignment(projectId, consultantId, actor.id, actor.email);
    return { success: true };
  } catch (err) {
    console.error("[assignConsultantFromForm]", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Assignment failed. Please try again.",
    };
  }
}

// ─── Upload a file to an existing project ────────────────────────────────────

export type UploadFileState = { error?: string; success?: boolean };

export async function uploadProjectFile(
  projectId: string,
  _prev: UploadFileState,
  formData: FormData
): Promise<UploadFileState> {
  const actor = await requireRole("client", "consultant", "super_admin");
  const supabase = createAdminClient();

  // Verify access based on role
  let query = supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .is("deleted_at", null);

  if (actor.role === "client") {
    query = query.eq("org_id", actor.org_id as string);
  } else if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 50 * 1024 * 1024) return { error: "File must be under 50 MB." };

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${project.org_id}/${projectId}/additional/${Date.now()}_${file.name}`;

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

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// ─── Consultant: enter project number and trigger PBDB generation ─────────────

export type ProjectNumberState = { error?: string; success?: boolean };

export async function saveProjectNumber(
  projectId: string,
  _prev: ProjectNumberState,
  formData: FormData
): Promise<ProjectNumberState> {
  const actor = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, org_id, project_number")
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

  try {
    await generatePbdb(projectId, actor.id);
  } catch (err) {
    // Roll back the project number so the consultant can retry
    await supabase.from("projects").update({ project_number: null }).eq("id", projectId);
    return {
      error:
        err instanceof Error ? err.message : "PBDB generation failed. Please try again.",
    };
  }

  // PBDB generated — consultant is now working on it
  await supabase
    .from("projects")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  await auditLog("project.pbdb_generated", actor.id, actor.email as string, {
    projectId,
    orgId: project.org_id as string,
    metadata: { project_number: rawNumber },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// ─── Consultant: re-upload corrected PBDB after QA ───────────────────────────

export type UploadQaPbdbState = { error?: string; success?: boolean };

export async function uploadQaPbdb(
  projectId: string,
  _prev: UploadQaPbdbState,
  formData: FormData
): Promise<UploadQaPbdbState> {
  const actor = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, org_id, status")
    .eq("id", projectId)
    .eq("status", "in_progress")
    .is("deleted_at", null);

  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or not in progress." };

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
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${project.org_id}/${projectId}/pbdb/${Date.now()}_qa_v${nextVersion}_${file.name}`;

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
    original_filename: file.name,
    uploaded_by: actor.id,
    version: nextVersion,
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);
    return { error: "Failed to record file. Please try again." };
  }

  await auditLog("project.pbdb_qa_uploaded", actor.id, actor.email as string, {
    projectId,
    orgId: project.org_id as string,
    metadata: { version: nextVersion, filename: file.name },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}`);
}

// ─── Consultant: mark QA complete ────────────────────────────────────────────

export type MarkQaCompleteState = { error?: string; success?: boolean };

export async function markQaComplete(
  projectId: string,
  _prev: MarkQaCompleteState,
  _formData: FormData
): Promise<MarkQaCompleteState> {
  const actor = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select("id, org_id, status, project_number, site_address, extracted_fields")
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
    .update({ status: "qa_complete", updated_at: new Date().toISOString() })
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
          message: `QA complete for project ${projectRef}. Ready for stakeholder dispatch.`,
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
    orgId: project.org_id as string,
    metadata: { project_ref: projectRef },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/ops/projects/${projectId}`);
}

// ─── Super Admin: update project field values ─────────────────────────────────

export type UpdateFieldsState = { error?: string; success?: boolean };

export async function updateProjectFields(
  projectId: string,
  _prev: UpdateFieldsState,
  formData: FormData
): Promise<UpdateFieldsState> {
  const actor = await requireRole("super_admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id, extracted_fields")
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
      orgId: project.org_id as string,
      projectId,
      metadata: { updated },
    }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}
