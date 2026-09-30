import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The exact PDF that went to stakeholders (#208).
 *
 * Both kinds are persisted at send time and never re-rendered afterwards:
 *
 * - PBDB: `getOrCreateDispatchPdf` stores a `pbdb_pdf` row for the cycle at
 *   dispatch. A cycle counts as *sent* only once stakeholder_reviews rows
 *   exist for it (a dispatch writes them in the same transaction).
 * - PBDR: the `pbdr` project_files row is the delivered PDF itself — it is
 *   only written by the delivery pipeline.
 *
 * `fileId` is the id the revision-history UI already has: the PBDB docx row
 * for a cycle, or the PBDR row. Returns null when nothing was sent (yet).
 */
export interface SentPdf {
  projectId: string;
  docType: "pbdb" | "pbdr";
  storagePath: string;
  originalFilename: string;
}

export async function resolveSentPdf(
  supabase: SupabaseClient,
  fileId: string
): Promise<SentPdf | null> {
  const { data: file } = await supabase
    .from("project_files")
    .select("id, project_id, file_type, storage_path, original_filename, version, review_cycle")
    .eq("id", fileId)
    .in("file_type", ["pbdb", "pbdr"])
    .maybeSingle();
  if (!file) return null;

  const projectId = file.project_id as string;

  if (file.file_type === "pbdr") {
    return {
      projectId,
      docType: "pbdr",
      storagePath: file.storage_path as string,
      originalFilename: file.original_filename as string,
    };
  }

  const cycle = file.review_cycle as number;
  const { data: reviews } = await supabase
    .from("stakeholder_reviews")
    .select("id")
    .eq("project_id", projectId)
    .eq("review_cycle", cycle)
    .limit(1);
  if (!reviews || reviews.length === 0) return null;

  const { data: pdf } = await supabase
    .from("project_files")
    .select("storage_path, original_filename")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb_pdf")
    .eq("review_cycle", cycle)
    .eq("version", file.version as number)
    .maybeSingle();
  if (!pdf) return null;

  return {
    projectId,
    docType: "pbdb",
    storagePath: pdf.storage_path as string,
    originalFilename: pdf.original_filename as string,
  };
}

/**
 * Of the given PBDB docx rows, which ones have a stored sent PDF — for
 * deciding which revision-history rows show "Download PDF (as sent)".
 * PBDR rows are always sent, so callers pass only PBDB ids here.
 */
export async function findSentPbdbFileIds(
  supabase: SupabaseClient,
  projectId: string,
  files: { id: string; version: number; review_cycle: number }[]
): Promise<Set<string>> {
  if (files.length === 0) return new Set();
  const [{ data: reviews }, { data: pdfs }] = await Promise.all([
    supabase.from("stakeholder_reviews").select("review_cycle").eq("project_id", projectId),
    supabase
      .from("project_files")
      .select("review_cycle, version")
      .eq("project_id", projectId)
      .eq("file_type", "pbdb_pdf"),
  ]);
  const sentCycles = new Set((reviews ?? []).map((r) => r.review_cycle as number));
  const pdfKeys = new Set((pdfs ?? []).map((p) => `${p.review_cycle}:${p.version}`));
  return new Set(
    files
      .filter((f) => sentCycles.has(f.review_cycle) && pdfKeys.has(`${f.review_cycle}:${f.version}`))
      .map((f) => f.id)
  );
}
