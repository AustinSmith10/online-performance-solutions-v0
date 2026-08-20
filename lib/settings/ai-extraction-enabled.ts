import type { SupabaseClient } from "@supabase/supabase-js";

// Kill switch for AI extraction (#153) — lets a super admin disable all
// Anthropic-backed extraction calls (runSingleExtraction / runTextCompletion
// in lib/documents/extractor.ts) without a code deploy. Off short-circuits
// to the same empty/fallback result already used when ANTHROPIC_API_KEY is
// unset or the SDK call throws — no new failure mode.
export const AI_EXTRACTION_ENABLED_KEY = "ai_extraction_enabled";

export const DEFAULT_AI_EXTRACTION_ENABLED = true;

export async function getAiExtractionEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", AI_EXTRACTION_ENABLED_KEY)
    .maybeSingle();

  const value = (data?.value as { enabled?: unknown } | undefined)?.enabled;
  return typeof value === "boolean" ? value : DEFAULT_AI_EXTRACTION_ENABLED;
}

export async function setAiExtractionEnabled(
  supabase: SupabaseClient,
  enabled: boolean,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase.from("app_settings").upsert({
    key: AI_EXTRACTION_ENABLED_KEY,
    value: { enabled },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
