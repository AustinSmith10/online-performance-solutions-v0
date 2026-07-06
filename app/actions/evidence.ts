"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

export type AttachEvidenceState = { error?: string; success?: boolean };

// Generic evidence-attachment primitive (#57): lets a consultant or admin attach
// a file (forwarded email, screenshot, correspondence) to a project, independent
// of any other workflow step. Every attachment writes an audit_log entry so
// there's a permanent record of who attached what evidence, and when.
export async function attachEvidence(
  projectId: string,
  _prev: AttachEvidenceState,
  formData: FormData
): Promise<AttachEvidenceState> {
  const actor = await requireRole("consultant", "admin", "super_admin");
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

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a file." };
  if (file.size > 50 * 1024 * 1024) return { error: "File must be under 50 MB." };

  const reference = (formData.get("reference") as string | null)?.trim() || null;

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${project.client_id}/${projectId}/evidence/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("submissions")
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data: inserted, error: insertError } = await supabase
    .from("project_files")
    .insert({
      project_id: projectId,
      file_type: "evidence",
      storage_path: storagePath,
      original_filename: file.name,
      uploaded_by: actor.id,
      reference,
    })
    .select("id")
    .single();

  if (insertError) {
    await supabase.storage.from("submissions").remove([storagePath]);
    return { error: "Failed to record evidence. Please try again." };
  }

  await auditLog("evidence.attached", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      file_id: inserted.id,
      filename: file.name,
      reference,
    },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}
