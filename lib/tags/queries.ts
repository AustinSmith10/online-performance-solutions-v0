import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tag reads for the *internal* UI (#211/#213). These are the only readers of
 * the tags tables; document, email and notification builders must not import
 * this module (enforced by lib/tags/tag-isolation.test.ts). Callers must only
 * invoke it for internal roles — it does not check who is asking.
 */
export interface Tag {
  id: string;
  name: string;
  color: string;
}

export async function listTags(supabase: SupabaseClient): Promise<Tag[]> {
  const { data } = await supabase.from("tags").select("id, name, color").order("name");
  return (data ?? []) as Tag[];
}

/** userId → that account's tags, sorted by name. Accounts with no tags are absent. */
export async function getTagsByUserId(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from("account_tags")
    .select("user_id, tags(id, name, color)")
    .in("user_id", ids);

  for (const row of (data ?? []) as unknown as { user_id: string; tags: Tag | null }[]) {
    if (!row.tags) continue;
    const list = map.get(row.user_id) ?? [];
    list.push(row.tags);
    map.set(row.user_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}
