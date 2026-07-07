import type { SupabaseClient } from "@supabase/supabase-js";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { stripRedTokenColor } from "@/lib/documents/color-strip";

export interface DispatchPdfProject {
  id: string;
  client_id: string;
  review_cycle: number;
  strip_token_color: boolean | null;
}

export interface DispatchPdf {
  storagePath: string;
  originalFilename: string;
}

/**
 * Returns the locked-down PDF stakeholders should see for a project's current
 * review cycle, generating and caching it on first use.
 *
 * Stakeholders must never receive the editable PBDB docx — this converts the
 * cycle's source docx to PDF once (applying the strip-token-color toggle at
 * that point, matching how lib/documents/delivery.ts bakes the same toggle
 * into the PBDR at conversion time) and reuses the stored PDF on subsequent
 * calls for the same cycle instead of re-converting.
 *
 * Returns null if no source docx exists yet for this cycle.
 */
export async function getOrCreateDispatchPdf(
  supabase: SupabaseClient,
  project: DispatchPdfProject,
  actorId: string
): Promise<DispatchPdf | null> {
  const { data: existingPdf } = await supabase
    .from("project_files")
    .select("storage_path, original_filename")
    .eq("project_id", project.id)
    .eq("file_type", "pbdb_pdf")
    .eq("review_cycle", project.review_cycle)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPdf) {
    return {
      storagePath: existingPdf.storage_path as string,
      originalFilename: existingPdf.original_filename as string,
    };
  }

  const { data: sourceDocx } = await supabase
    .from("project_files")
    .select("storage_path, original_filename, version")
    .eq("project_id", project.id)
    .eq("file_type", "pbdb")
    .eq("review_cycle", project.review_cycle)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sourceDocx) return null;

  const { data: docxBlob, error: dlErr } = await supabase.storage
    .from("documents")
    .download(sourceDocx.storage_path as string);

  if (dlErr || !docxBlob) {
    throw new Error(`Failed to download PBDB docx: ${dlErr?.message ?? "unknown"}`);
  }

  let docxBuffer: Buffer = Buffer.from(await docxBlob.arrayBuffer());
  if (project.strip_token_color) {
    docxBuffer = stripRedTokenColor(docxBuffer);
  }

  const pdfBuffer = await convertDocxToPdf(docxBuffer);

  const docxPath = sourceDocx.storage_path as string;
  const storagePath = docxPath.replace(/\.docx$/i, ".pdf");
  const originalFilename = (sourceDocx.original_filename as string).replace(/\.docx$/i, ".pdf");

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, pdfBuffer, { contentType: "application/pdf" });

  if (uploadErr) throw new Error(`Failed to store PBDB PDF: ${uploadErr.message}`);

  const { error: insertErr } = await supabase.from("project_files").insert({
    project_id: project.id,
    file_type: "pbdb_pdf",
    storage_path: storagePath,
    original_filename: originalFilename,
    uploaded_by: actorId,
    version: sourceDocx.version as number,
    review_cycle: project.review_cycle,
  });

  if (insertErr) {
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(`Failed to record PBDB PDF: ${insertErr.message}`);
  }

  return { storagePath, originalFilename };
}
