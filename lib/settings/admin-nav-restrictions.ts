import type { SupabaseClient } from "@supabase/supabase-js";

export const RESTRICTABLE_NAV_ITEMS = [
  { key: "clients", label: "Clients" },
  { key: "projects", label: "Projects" },
  { key: "stakeholders", label: "Stakeholders" },
  { key: "users", label: "Internal Users" },
  { key: "templates", label: "Templates" },
  { key: "credits", label: "Credits" },
  { key: "audit", label: "Audit" },
  { key: "recovery", label: "Recovery Bin" },
  { key: "system-health", label: "System Health" },
  { key: "settings", label: "Settings" },
] as const;

export type AdminNavKey = (typeof RESTRICTABLE_NAV_ITEMS)[number]["key"];

const NAV_KEYS: readonly string[] = RESTRICTABLE_NAV_ITEMS.map((item) => item.key);

export const ADMIN_NAV_RESTRICTIONS_KEY = "admin_nav_super_admin_restrictions";

export const DEFAULT_ADMIN_NAV_RESTRICTIONS: AdminNavKey[] = [];

export async function getAdminNavRestrictions(
  supabase: SupabaseClient
): Promise<AdminNavKey[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", ADMIN_NAV_RESTRICTIONS_KEY)
    .maybeSingle();

  const restricted = (data?.value as { restricted?: unknown } | undefined)?.restricted;
  if (!Array.isArray(restricted)) return DEFAULT_ADMIN_NAV_RESTRICTIONS;
  return restricted.filter((key): key is AdminNavKey => NAV_KEYS.includes(key));
}

export async function setAdminNavRestrictions(
  supabase: SupabaseClient,
  restricted: AdminNavKey[],
  updatedBy?: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase.from("app_settings").upsert({
    key: ADMIN_NAV_RESTRICTIONS_KEY,
    value: { restricted },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
