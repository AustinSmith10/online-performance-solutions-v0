import type { SupabaseClient } from "@supabase/supabase-js";

// How much of each document's parsed text the field-extraction pipeline
// (lib/documents/extractor.ts) sends to the AI — the bulk of document-
// processing spend. Admin-configurable so cost can be traded against how much
// of a long document extraction sees. Independent of the upload-slot judge's
// own cap (lib/settings/judge-document-text-cap.ts).
//
// Capped at 150,000: extractWithAnthropic's 180s timeout is sized for that
// much input, and a longer prompt that times out fails silently into an empty
// extraction rather than a visible error (#139). Lowering is always safe.
export const DEFAULT_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP = 150_000;
export const MAX_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP = 150_000;
export const MIN_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP = 1_000;

export const EXTRACTION_DOCUMENT_TEXT_CHAR_CAP_KEY = "extraction_document_text_char_cap";

function isValidCap(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP &&
    value <= MAX_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP
  );
}

export async function getExtractionDocumentTextCharCap(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", EXTRACTION_DOCUMENT_TEXT_CHAR_CAP_KEY)
    .maybeSingle();

  const value = (data?.value as { cap?: unknown } | undefined)?.cap;
  return isValidCap(value) ? value : DEFAULT_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP;
}

export async function setExtractionDocumentTextCharCap(
  supabase: SupabaseClient,
  cap: number,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!isValidCap(cap)) {
    return {
      error: `Enter a whole number between ${MIN_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP.toLocaleString("en-AU")} and ${MAX_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP.toLocaleString("en-AU")}.`,
    };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: EXTRACTION_DOCUMENT_TEXT_CHAR_CAP_KEY,
    value: { cap },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
