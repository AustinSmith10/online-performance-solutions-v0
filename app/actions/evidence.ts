"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

export type AttachEvidenceState = { error?: string; success?: boolean };

// Extension -> content type, not file.type: browsers report .eml/.msg
// inconsistently (often "" or "application/octet-stream"), so we resolve
// the type we upload with from the filename instead of trusting the
// browser-supplied MIME type.
const ALLOWED_EVIDENCE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
};

async function findAccessibleProject(
  supabase: ReturnType<typeof createAdminClient>,
  actor: { role: string; id: string },
  projectId: string
) {
  let query = supabase
    .from("projects")
    .select("id, client_id, assigned_consultant_id")
    .eq("id", projectId)
    .is("deleted_at", null);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }
  const { data } = await query.maybeSingle();
  return data;
}

export type RequestEvidenceUploadResult =
  | { error: string }
  | { path: string; signedUrl: string; token: string; contentType: string };

// Step 1: request a signed upload URL. The browser then uploads the file
// bytes directly to the `evidence` bucket — no file body passes through
// this server action (#86).
export async function requestEvidenceUploadUrl(
  projectId: string,
  filename: string,
  size: number
): Promise<RequestEvidenceUploadResult> {
  const actor = await requireRole("consultant", "admin", "super_admin");
  const supabase = createAdminClient();

  const project = await findAccessibleProject(supabase, actor, projectId);
  if (!project) return { error: "Project not found or access denied." };

  if (!size || size === 0) return { error: "Please select a file." };
  if (size > 50 * 1024 * 1024) return { error: "File must be under 50 MB." };

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = ALLOWED_EVIDENCE_TYPES[extension];
  if (!contentType) {
    return {
      error: "Unsupported file type. Attach a PDF, JPEG, PNG, TIFF, or a forwarded email (.eml/.msg).",
    };
  }

  const storagePath = `${project.client_id}/${projectId}/evidence/${Date.now()}_${filename}`;
  const { data, error } = await supabase.storage.from("evidence").createSignedUploadUrl(storagePath);
  if (error || !data) return { error: "Failed to prepare upload. Please try again." };

  return { path: storagePath, signedUrl: data.signedUrl, token: data.token, contentType };
}

// Generic evidence-attachment primitive (#57): lets a consultant or admin attach
// a file (forwarded email, screenshot, correspondence) to a project, independent
// of any other workflow step. Every attachment writes an audit_log entry so
// there's a permanent record of who attached what evidence, and when.
//
// Step 2: called after the browser has already uploaded the file to
// `storagePath` via the signed URL from requestEvidenceUploadUrl.
export async function attachEvidence(
  projectId: string,
  storagePath: string,
  filename: string,
  reference: string | null
): Promise<AttachEvidenceState> {
  const actor = await requireRole("consultant", "admin", "super_admin");
  const supabase = createAdminClient();

  const project = await findAccessibleProject(supabase, actor, projectId);
  if (!project) return { error: "Project not found or access denied." };

  // Confirm the upload actually landed at the expected path (and under the
  // size limit) before recording metadata for it — the browser controls the
  // actual bytes, so the declared size at request time can't be trusted.
  const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const objectName = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data: listing } = await supabase.storage.from("evidence").list(folder);
  const entry = listing?.find((f) => f.name === objectName);
  if (!entry) return { error: "Upload did not complete. Please try again." };
  if ((entry.metadata?.size ?? 0) > 50 * 1024 * 1024) {
    await supabase.storage.from("evidence").remove([storagePath]);
    return { error: "File must be under 50 MB." };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("project_files")
    .insert({
      project_id: projectId,
      file_type: "evidence",
      storage_path: storagePath,
      original_filename: filename,
      uploaded_by: actor.id,
      reference,
    })
    .select("id")
    .single();

  if (insertError) {
    await supabase.storage.from("evidence").remove([storagePath]);
    return { error: "Failed to record evidence. Please try again." };
  }

  await auditLog("evidence.attached", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: {
      file_id: inserted.id,
      filename,
      reference,
    },
  });

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}
