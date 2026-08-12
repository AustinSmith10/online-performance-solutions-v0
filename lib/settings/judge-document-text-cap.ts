import type { SupabaseClient } from "@supabase/supabase-js";

// How much of a document's parsed text gets sent to the file-requirement AI
// judge (lib/documents/file-requirement-verification.ts). Admin-configurable
// rather than a fixed constant, since it directly trades off judge-call cost
// against how much of a long document the judge actually sees. Independent of
// the extraction pipeline's own DOC_TEXT_CHAR_CAP (lib/documents/extractor.ts).
export const DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP = 150_000;

export const JUDGE_DOCUMENT_TEXT_CHAR_CAP_KEY = "judge_document_text_char_cap";

function isValidCap(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function getJudgeDocumentTextCharCap(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", JUDGE_DOCUMENT_TEXT_CHAR_CAP_KEY)
    .maybeSingle();

  const value = (data?.value as { cap?: unknown } | undefined)?.cap;
  return isValidCap(value) ? value : DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP;
}

export async function setJudgeDocumentTextCharCap(
  supabase: SupabaseClient,
  cap: number,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!isValidCap(cap)) {
    return { error: "Enter a whole number greater than 0." };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: JUDGE_DOCUMENT_TEXT_CHAR_CAP_KEY,
    value: { cap },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
