import type { SupabaseClient } from "@supabase/supabase-js";

// Per-user AI extraction rate limit (#152) — bounds how many extraction
// calls a single account can trigger in a rolling 24-hour window, closing
// the gap between "auth-gated" and "actually metered": credit gating only
// happens later, at dispatch, so nothing today stops a compromised or
// careless account from running unlimited billed extractions before that
// point. Admin-configurable rather than a fixed constant, matching the
// existing app_settings pattern (see judge-document-text-cap.ts).
export const EXTRACTION_DAILY_LIMIT_KEY = "extraction_daily_limit";

export const DEFAULT_EXTRACTION_DAILY_LIMIT = 30;

function isValidLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function getExtractionDailyLimit(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", EXTRACTION_DAILY_LIMIT_KEY)
    .maybeSingle();

  const value = (data?.value as { limit?: unknown } | undefined)?.limit;
  return isValidLimit(value) ? value : DEFAULT_EXTRACTION_DAILY_LIMIT;
}

export async function setExtractionDailyLimit(
  supabase: SupabaseClient,
  limit: number,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!isValidLimit(limit)) {
    return { error: "Enter a whole number greater than 0." };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: EXTRACTION_DAILY_LIMIT_KEY,
    value: { limit },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
