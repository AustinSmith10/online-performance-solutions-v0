"use server";

import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { getOrCreateDispatchPdf, type DispatchPdfProject } from "@/lib/documents/pbdb-pdf";
import { writeProgress } from "@/lib/documents/progress";

export type FilePreviewResult = { error: string } | { url: string; filename: string };

// project_files.file_type → the storage bucket its bytes live in.
function bucketFor(fileType: string): "submissions" | "evidence" | "documents" {
  if (fileType === "evidence") return "evidence";
  if (fileType === "pbdb" || fileType === "pbdb_pdf" || fileType === "pbdr") return "documents";
  return "submissions";
}

/**
 * Signed URL for previewing any file attached to a project — submission
 * documents, evidence, generated PBDBs, converted PBDRs — so the Documents tab
 * can offer "Preview" on every row, not just downloads.
 *
 * PDFs and images are signed straight from storage. The editable PBDB .docx
 * (which the inline viewer can't render) is converted to the same locked PDF
 * stakeholders see, via getOrCreateDispatchPdf, and that PDF is cached. Any
 * other stray .docx is converted on the fly and cached under `_previews/`.
 */
export async function getProjectFilePreviewUrl(
  projectId: string,
  fileId: string
): Promise<FilePreviewResult> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const { data: file, error: fileErr } = await supabase
    .from("project_files")
    .select("id, project_id, file_type, storage_path, original_filename, review_cycle")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (fileErr || !file) return { error: "File not found." };

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, client_id, assigned_consultant_id, review_cycle, strip_token_color, project_number, extracted_fields, progress_pct"
    )
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return { error: "Project not found." };
  if (actor.role === "consultant" && project.assigned_consultant_id !== actor.id) {
    return { error: "You are not assigned to this project." };
  }

  const fileType = file.file_type as string;
  const storagePath = file.storage_path as string;
  const displayName =
    (file.original_filename as string) || storagePath.split("/").pop() || "document";

  async function logged(result: { url: string; filename: string }) {
    await auditLog("project.file_previewed", actor.id, actor.email, {
      projectId,
      orgId: project!.client_id as string,
      metadata: { fileId, fileType },
    });
    return result;
  }

  // Editable PBDB docx → the cached locked PDF for that file's own cycle.
  if (fileType === "pbdb") {
    // #172: one heavy document operation per project at a time. The cached-PDF
    // fast path never trips this (getOrCreateDispatchPdf returns before the
    // first onStep), so a re-open of an already-rendered PBDB stays instant.
    if (project.progress_pct !== null && project.progress_pct !== undefined) {
      return { error: "A document is already being generated for this project — try again once it finishes." };
    }

    let pdf;
    try {
      pdf = await getOrCreateDispatchPdf(
        supabase,
        {
          ...(project as unknown as DispatchPdfProject),
          review_cycle: (file.review_cycle as number) ?? (project.review_cycle as number),
        },
        actor.id,
        (pct) => writeProgress(supabase, projectId, pct)
      );
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to render the PBDB." };
    } finally {
      // Clear the in-flight marker on success and failure alike — matches
      // buildPbdrPreview. A no-op when the fast path never wrote one.
      await writeProgress(supabase, projectId, null);
    }
    if (!pdf) return { error: "No PBDB document found for this cycle." };

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(pdf.storagePath, 900);
    if (!signed?.signedUrl) return { error: "Could not generate a preview link." };
    return logged({ url: signed.signedUrl, filename: pdf.originalFilename });
  }

  // Defensive: any other .docx-backed row — convert once, cache under _previews/.
  if (/\.docx$/i.test(storagePath)) {
    const bucket = bucketFor(fileType);
    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
    if (dlErr || !blob) return { error: "Could not download the file." };

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await convertDocxToPdf(Buffer.from(await blob.arrayBuffer()));
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to render the file." };
    }

    const previewPath = `_previews/${fileId}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(previewPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (upErr) return { error: `Could not store the preview: ${upErr.message}` };

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(previewPath, 900);
    if (!signed?.signedUrl) return { error: "Could not generate a preview link." };
    return logged({ url: signed.signedUrl, filename: displayName.replace(/\.docx$/i, ".pdf") });
  }

  // Everything else (PDF / image) is previewable as stored.
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucketFor(fileType))
    .createSignedUrl(storagePath, 900);
  if (signErr || !signed?.signedUrl) return { error: "Could not generate a preview link." };
  return logged({ url: signed.signedUrl, filename: displayName });
}
