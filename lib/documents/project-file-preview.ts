import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit/log";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { getOrCreateDispatchPdf, type DispatchPdfProject } from "@/lib/documents/pbdb-pdf";

export type PreviewProgressEvent =
  | { type: "step"; pct: number }
  | { type: "ready"; url: string; filename: string }
  | { type: "error"; message: string };

export interface PreviewActor {
  id: string;
  role: string;
  email: string | null;
}

const SIGNED_URL_TTL = 900;

// project_files.file_type → the storage bucket its bytes live in.
function bucketFor(fileType: string): "submissions" | "evidence" | "documents" {
  if (fileType === "evidence") return "evidence";
  if (fileType === "pbdb" || fileType === "pbdb_pdf" || fileType === "pbdr") return "documents";
  return "submissions";
}

/**
 * Resolves a previewable signed URL for any file attached to a project —
 * submission documents, evidence, generated PBDBs, converted PBDRs — pushing
 * `step` events as it goes so the SSE route
 * (app/api/projects/[id]/files/[fileId]/preview-stream) can stream a real
 * progress bar to the Documents-tab previewer.
 *
 * PDFs and images are signed straight from storage (one `ready`, no `step`s).
 * The editable PBDB .docx is converted to the same locked PDF stakeholders
 * see, via getOrCreateDispatchPdf, which reports four conversion boundaries.
 * Any other stray .docx is converted on the fly and cached under `_previews/`.
 *
 * Never throws — every failure path ends in exactly one terminal `error`
 * event, mirroring runUploadPipeline / streamUploadedFile.
 */
export async function resolveProjectFilePreview(
  supabase: SupabaseClient,
  opts: { projectId: string; fileId: string; actor: PreviewActor },
  onEvent: (event: PreviewProgressEvent) => void | Promise<void>
): Promise<void> {
  const { projectId, fileId, actor } = opts;

  // Emit immediately, before any I/O — gives the client a frame the instant
  // the stream is flowing (so the bar always appears), and the `step`/`ready`
  // pair still sweeps 10→100 for the fast paths (cached PBDB PDF, plain
  // PDF/image) that do no conversion work.
  await onEvent({ type: "step", pct: 10 });

  const { data: file, error: fileErr } = await supabase
    .from("project_files")
    .select("id, project_id, file_type, storage_path, original_filename, review_cycle")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (fileErr || !file) {
    await onEvent({ type: "error", message: "File not found." });
    return;
  }

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, client_id, assigned_consultant_id, review_cycle, strip_token_color, project_number, extracted_fields"
    )
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) {
    await onEvent({ type: "error", message: "Project not found." });
    return;
  }
  if (actor.role === "consultant" && project.assigned_consultant_id !== actor.id) {
    await onEvent({ type: "error", message: "You are not assigned to this project." });
    return;
  }

  const fileType = file.file_type as string;
  const storagePath = file.storage_path as string;
  const displayName =
    (file.original_filename as string) || storagePath.split("/").pop() || "document";

  const emitReady = async (url: string, filename: string) => {
    await auditLog("project.file_previewed", actor.id, actor.email, {
      projectId,
      orgId: project.client_id as string,
      metadata: { fileId, fileType },
    });
    await onEvent({ type: "step", pct: 100 });
    await onEvent({ type: "ready", url, filename });
  };

  // ── Editable PBDB docx → the cached locked PDF for that file's own cycle ──
  if (fileType === "pbdb") {
    let pdf;
    try {
      pdf = await getOrCreateDispatchPdf(
        supabase,
        {
          ...(project as unknown as DispatchPdfProject),
          review_cycle: (file.review_cycle as number) ?? (project.review_cycle as number),
        },
        actor.id,
        (pct) => onEvent({ type: "step", pct })
      );
    } catch (err) {
      await onEvent({ type: "error", message: err instanceof Error ? err.message : "Failed to render the PBDB." });
      return;
    }
    if (!pdf) {
      await onEvent({ type: "error", message: "No PBDB document found for this cycle." });
      return;
    }

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(pdf.storagePath, SIGNED_URL_TTL);
    if (!signed?.signedUrl) {
      await onEvent({ type: "error", message: "Could not generate a preview link." });
      return;
    }
    await emitReady(signed.signedUrl, pdf.originalFilename);
    return;
  }

  // ── Defensive: any other .docx-backed row — convert once, cache under _previews/ ──
  if (/\.docx$/i.test(storagePath)) {
    await onEvent({ type: "step", pct: 20 });
    const bucket = bucketFor(fileType);
    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
    if (dlErr || !blob) {
      await onEvent({ type: "error", message: "Could not download the file." });
      return;
    }

    await onEvent({ type: "step", pct: 40 });
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await convertDocxToPdf(Buffer.from(await blob.arrayBuffer()));
    } catch (err) {
      await onEvent({ type: "error", message: err instanceof Error ? err.message : "Failed to render the file." });
      return;
    }

    await onEvent({ type: "step", pct: 70 });
    const previewPath = `_previews/${fileId}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(previewPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      await onEvent({ type: "error", message: `Could not store the preview: ${upErr.message}` });
      return;
    }

    await onEvent({ type: "step", pct: 90 });
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(previewPath, SIGNED_URL_TTL);
    if (!signed?.signedUrl) {
      await onEvent({ type: "error", message: "Could not generate a preview link." });
      return;
    }
    await emitReady(signed.signedUrl, displayName.replace(/\.docx$/i, ".pdf"));
    return;
  }

  // ── Everything else (PDF / image) is previewable as stored ──
  const { data: signed, error: signErr } = await supabase.storage
    .from(bucketFor(fileType))
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (signErr || !signed?.signedUrl) {
    await onEvent({ type: "error", message: "Could not generate a preview link." });
    return;
  }
  await emitReady(signed.signedUrl, displayName);
}
