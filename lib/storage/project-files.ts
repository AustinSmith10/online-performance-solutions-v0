import type { SupabaseClient } from "@supabase/supabase-js";

// Generated docs (pbdb/pbdr) live in the `documents` bucket; everything else
// client uploads (po, building_plans, additional, evidence, dynamic
// file_requirements slugs) lives in `submissions`. See lib/documents/generator.ts
// and lib/documents/delivery.ts for the write side of this split.
const DOCUMENTS_BUCKET_FILE_TYPES = new Set(["pbdb", "pbdr"]);

/**
 * Removes a project's files from storage ahead of a hard delete. Best-effort:
 * logs and continues past bucket errors so a purge isn't blocked by storage.
 */
export async function removeProjectStorageFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  projectId: string
): Promise<void> {
  const { data: files } = await supabase
    .from("project_files")
    .select("storage_path, file_type")
    .eq("project_id", projectId);

  if (!files || files.length === 0) return;

  const submissionsPaths: string[] = [];
  const documentsPaths: string[] = [];

  for (const file of files) {
    const bucket = DOCUMENTS_BUCKET_FILE_TYPES.has(file.file_type as string)
      ? documentsPaths
      : submissionsPaths;
    bucket.push(file.storage_path as string);
  }

  if (submissionsPaths.length > 0) {
    const { error } = await supabase.storage.from("submissions").remove(submissionsPaths);
    if (error) {
      console.error(`[removeProjectStorageFiles] submissions bucket cleanup failed for ${projectId}:`, error);
    }
  }

  if (documentsPaths.length > 0) {
    const { error } = await supabase.storage.from("documents").remove(documentsPaths);
    if (error) {
      console.error(`[removeProjectStorageFiles] documents bucket cleanup failed for ${projectId}:`, error);
    }
  }
}
