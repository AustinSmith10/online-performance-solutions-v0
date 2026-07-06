import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES } from "./taxonomy";

// Shared between the admin audit page and the CSV export route so both stay
// in lockstep on what "the currently applied filters" means.

export const SORT_COLS = ["created_at", "event_type", "actor_email"] as const;
export type SortCol = (typeof SORT_COLS)[number];

export type AuditFilters = {
  email?: string;
  category?: string;
  event_type?: string;
  org_name?: string;
  from?: string;
  to?: string;
  project_id?: string;
  excluded_event_types?: string[];
};

export type AuditRow = {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_email: string | null;
  project_id: string | null;
  client_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  project: { project_number: string | null } | null;
  org: { name: string } | null;
};

// PostgREST caps rows per request (see supabase/config.toml max_rows) — the
// export walks the result set in pages of this size rather than one big fetch.
const FETCH_BATCH_SIZE = 1000;

async function resolveOrgIds(
  supabase: SupabaseClient,
  orgName: string | undefined
): Promise<string[] | null> {
  if (!orgName?.trim()) return null;
  const { data } = await supabase
    .from("clients")
    .select("id")
    .ilike("name", `%${orgName.trim()}%`);
  return (data ?? []).map((o) => o.id as string);
}

function buildQuery(
  supabase: SupabaseClient,
  filters: AuditFilters,
  orgIds: string[] | null
) {
  let query = supabase
    .from("audit_log")
    .select("*, project:projects(project_number), org:clients(name)", { count: "exact" });

  if (filters.email?.trim()) {
    query = query.ilike("actor_email", `%${filters.email.trim()}%`);
  }

  // event_type takes precedence over category
  if (filters.event_type?.trim()) {
    query = query.eq("event_type", filters.event_type.trim());
  } else if (filters.category?.trim() && CATEGORIES[filters.category.trim()]) {
    query = query.in("event_type", CATEGORIES[filters.category.trim()].events);
  }

  if (orgIds !== null && orgIds.length > 0) {
    query = query.in("client_id", orgIds);
  }

  if (filters.project_id?.trim()) {
    query = query.eq("project_id", filters.project_id.trim());
  }

  if (filters.excluded_event_types && filters.excluded_event_types.length > 0) {
    query = query.not("event_type", "in", `(${filters.excluded_event_types.join(",")})`);
  }

  if (filters.from?.trim()) {
    query = query.gte("created_at", new Date(filters.from.trim()).toISOString());
  }
  if (filters.to?.trim()) {
    const toDate = new Date(filters.to.trim());
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("created_at", toDate.toISOString());
  }

  return query;
}

export async function fetchAuditPage(
  supabase: SupabaseClient,
  filters: AuditFilters,
  sortCol: SortCol,
  sortOrder: "asc" | "desc",
  page: number,
  pageSize: number
): Promise<{ entries: AuditRow[]; totalCount: number }> {
  const orgIds = await resolveOrgIds(supabase, filters.org_name);

  // Org filter matched nothing — skip the query rather than fetching unfiltered rows.
  if (orgIds !== null && orgIds.length === 0) {
    return { entries: [], totalCount: 0 };
  }

  const { data, count } = await buildQuery(supabase, filters, orgIds)
    .order(sortCol, { ascending: sortOrder === "asc" })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  return { entries: (data ?? []) as AuditRow[], totalCount: count ?? 0 };
}

// Fetches every matching row for the given filters/sort, ignoring any on-screen
// page size — used by CSV export so downloads aren't capped like the UI is.
export async function fetchAllAuditEntries(
  supabase: SupabaseClient,
  filters: AuditFilters,
  sortCol: SortCol,
  sortOrder: "asc" | "desc"
): Promise<AuditRow[]> {
  const orgIds = await resolveOrgIds(supabase, filters.org_name);

  if (orgIds !== null && orgIds.length === 0) {
    return [];
  }

  const entries: AuditRow[] = [];
  let batch = 0;
  while (true) {
    const { data } = await buildQuery(supabase, filters, orgIds)
      .order(sortCol, { ascending: sortOrder === "asc" })
      .range(batch * FETCH_BATCH_SIZE, (batch + 1) * FETCH_BATCH_SIZE - 1);

    const rows = (data ?? []) as AuditRow[];
    entries.push(...rows);

    if (rows.length < FETCH_BATCH_SIZE) break;
    batch += 1;
  }

  return entries;
}
