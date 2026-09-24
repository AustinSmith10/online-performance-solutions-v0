// Pure list logic for the consultant dashboard: overdue arithmetic, attention
// ordering, search and paging. Kept free of React/Supabase so it is unit-tested
// and shared by the server page (which applies it) and the client (URL helpers).

export const SECTION_KEYS = ["active", "stakeholders", "archive", "available"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const PAGE_SIZE = 20;

/** Whole calendar days a date-only delivery date is past `todayIso` (0 when not overdue). */
export function daysOverdue(expectedIso: string | null, todayIso: string): number {
  if (!expectedIso) return 0;
  const ms = Date.parse(todayIso.slice(0, 10)) - Date.parse(expectedIso.slice(0, 10));
  return ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

type Rankable = { isRevision: boolean; isOverdue: boolean; daysOverdue: number };

/** Revisions first, then overdue (most overdue first), then the rest. Stable. */
export function sortByAttention<T extends Rankable>(items: T[]): T[] {
  const rank = (p: T) => (p.isRevision ? 0 : p.isOverdue ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.daysOverdue - a.daysOverdue : 0));
}

export function matchesQuery(query: string, parts: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || parts.some((x) => x?.toLowerCase().includes(q));
}

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount, total: items.length };
}

export function parseSection(value: string | undefined): SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value ?? "") ? (value as SectionKey) : "active";
}

export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
