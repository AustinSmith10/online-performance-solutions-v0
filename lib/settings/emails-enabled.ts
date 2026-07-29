import type { SupabaseClient } from "@supabase/supabase-js";

export const EMAILS_ENABLED_KEY = "emails_enabled";

export const DEFAULT_EMAILS_ENABLED = true;

export async function getEmailsEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", EMAILS_ENABLED_KEY)
    .maybeSingle();

  const value = (data?.value as { enabled?: unknown } | undefined)?.enabled;
  return typeof value === "boolean" ? value : DEFAULT_EMAILS_ENABLED;
}

export async function setEmailsEnabled(
  supabase: SupabaseClient,
  enabled: boolean,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase.from("app_settings").upsert({
    key: EMAILS_ENABLED_KEY,
    value: { enabled },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
