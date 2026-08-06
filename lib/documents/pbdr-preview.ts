import type { SupabaseClient } from "@supabase/supabase-js";
import { convertPbdbToPbdr } from "@/lib/documents/converter";
import { setRevisionHistoryRows, setCoverRevisionNumber } from "@/lib/documents/revision-table";
import { stripRedTokenColor } from "@/lib/documents/color-strip";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { buildPbdrFilename } from "@/lib/documents/naming";
import { peekNextRevNumber, getRevisionHistory, formatRevisionHistoryRows } from "@/lib/documents/revision-history";
import { formatAddress } from "@/lib/documents/formatters";

export interface PbdrPreviewProject {
  id: string;
  client_id: string;
  review_cycle: number;
  strip_token_color: boolean | null;
  project_number: string | null;
  extracted_fields: Record<string, string> | null;
  assigned_consultant_id: string | null;
}

export interface PbdrPreview {
  storagePath: string;
  originalFilename: string;
}

/**
 * Renders what the PBDR would look like if converted right now, using the
 * exact same transform as deliverPbdr() (lib/documents/delivery.ts) — PBDB→PBDR
 * text swaps, revision-history table rebuild, cover revision patch, and the
 * strip-token-color toggle — but without any of deliverPbdr's side effects:
 * no revision_history row is recorded, no project_files row is inserted, no
 * status change, no email. The rendered PDF is written to a fixed
 * preview-only storage path that gets overwritten on each call, so repeated
 * previews don't accumulate files or version numbers.
 *
 * Returns null if no QA'd PBDB exists yet for the project's current review cycle.
 */
export async function buildPbdrPreview(
  supabase: SupabaseClient,
  project: PbdrPreviewProject
): Promise<PbdrPreview | null> {
  const { data: pbdbFile } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("project_id", project.id)
    .eq("file_type", "pbdb")
    .eq("review_cycle", project.review_cycle)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdbFile) return null;

  const { data: docxBlob, error: dlErr } = await supabase.storage
    .from("documents")
    .download(pbdbFile.storage_path as string);

  if (dlErr || !docxBlob) {
    throw new Error(`Failed to download PBDB: ${dlErr?.message ?? "unknown"}`);
  }

  const pbdbBuffer = Buffer.from(await docxBlob.arrayBuffer());

  let transformedDocx = convertPbdbToPbdr(pbdbBuffer);

  // Peeked, not recorded — this is a preview, the real rev number is only
  // earned when deliverPbdr() actually converts (see peekNextRevNumber doc).
  const revisionIndex = await peekNextRevNumber(supabase, project.id, "pbdr");

  const existingPbdrHistory = (await getRevisionHistory(supabase, project.id)).filter(
    (row) => row.doc_type === "pbdr"
  );
  const pbdrHistoryForDoc = await formatRevisionHistoryRows(supabase, [
    ...existingPbdrHistory,
    {
      doc_type: "pbdr",
      rev_number: revisionIndex,
      prepared_by: project.assigned_consultant_id,
      event: "approved_conversion",
      created_at: new Date().toISOString(),
    },
  ]);
  transformedDocx = setRevisionHistoryRows(
    transformedDocx,
    pbdrHistoryForDoc.map((row) => ({
      docType: row.DOC_TYPE,
      revNumber: row.REV_NUMBER,
      date: row.DATE,
      purpose: row.EVENT,
      preparedBy: row.PREPARED_BY,
    }))
  );

  transformedDocx = setCoverRevisionNumber(transformedDocx, String(revisionIndex));

  if (project.strip_token_color) {
    transformedDocx = stripRedTokenColor(transformedDocx);
  }

  const pdfBuffer = await convertDocxToPdf(transformedDocx);

  const rawAddress = project.extracted_fields?.["EXTRACT_ADDRESS"] ?? "";
  const address = formatAddress(rawAddress);
  const originalFilename = buildPbdrFilename(
    project.project_number ?? project.id.slice(0, 8),
    revisionIndex,
    address,
    new Date()
  );

  const storagePath = `${project.client_id}/${project.id}/pbdr/preview.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  if (uploadErr) throw new Error(`Failed to store PBDR preview: ${uploadErr.message}`);

  return { storagePath, originalFilename };
}
