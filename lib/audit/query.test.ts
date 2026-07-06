import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchAuditPage, fetchAllAuditEntries } from "./query";

type Row = Record<string, unknown>;

/** In-memory Supabase stand-in that actually filters/sorts/paginates rows,
 * so tests exercise real filter semantics rather than asserting mock call args. */
function makeSupabase(auditRows: Row[], clientRows: Row[] = []) {
  return {
    from(table: string) {
      if (table === "clients") {
        return {
          select: () => ({
            ilike: async (col: string, pattern: string) => {
              const needle = pattern.replace(/%/g, "").toLowerCase();
              return {
                data: clientRows.filter((r) =>
                  String(r[col]).toLowerCase().includes(needle)
                ),
              };
            },
          }),
        };
      }

      let filtered = [...auditRows];
      let orderCol: string | null = null;
      let ascending = true;

      const builder = {
        select: () => builder,
        ilike: (col: string, pattern: string) => {
          const needle = pattern.replace(/%/g, "").toLowerCase();
          filtered = filtered.filter((r) =>
            String(r[col] ?? "").toLowerCase().includes(needle)
          );
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return builder;
        },
        not: (col: string, op: string, val: string) => {
          if (op === "in") {
            const vals = val.replace(/^\(|\)$/g, "").split(",");
            filtered = filtered.filter((r) => !vals.includes(r[col] as string));
          }
          return builder;
        },
        gte: (col: string, val: string) => {
          filtered = filtered.filter((r) => (r[col] as string) >= val);
          return builder;
        },
        lt: (col: string, val: string) => {
          filtered = filtered.filter((r) => (r[col] as string) < val);
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderCol = col;
          ascending = opts?.ascending ?? true;
          return builder;
        },
        range: async (start: number, end: number) => {
          let rows = [...filtered];
          if (orderCol) {
            const col = orderCol;
            rows = rows.sort((a, b) => {
              const av = a[col] as string;
              const bv = b[col] as string;
              return ascending ? (av < bv ? -1 : av > bv ? 1 : 0) : av < bv ? 1 : av > bv ? -1 : 0;
            });
          }
          return { data: rows.slice(start, end + 1), count: rows.length };
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function row(overrides: Row): Row {
  return {
    id: "id",
    event_type: "auth.login",
    actor_id: "user-1",
    actor_email: "user@example.com",
    project_id: null,
    client_id: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00.000Z",
    project: null,
    org: null,
    ...overrides,
  };
}

describe("fetchAuditPage", () => {
  it("applies the event_type filter and reports the filtered total, not the unfiltered total", async () => {
    const rows = [
      row({ id: "1", event_type: "auth.login" }),
      row({ id: "2", event_type: "org.created" }),
      row({ id: "3", event_type: "auth.login" }),
    ];
    const supabase = makeSupabase(rows);

    const { entries, totalCount } = await fetchAuditPage(
      supabase,
      { event_type: "auth.login" },
      "created_at",
      "desc",
      0,
      50
    );

    expect(totalCount).toBe(2);
    expect(entries.map((e) => e.id).sort()).toEqual(["1", "3"]);
  });

  it("respects sort order", async () => {
    const rows = [
      row({ id: "1", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "2", created_at: "2026-01-03T00:00:00.000Z" }),
      row({ id: "3", created_at: "2026-01-02T00:00:00.000Z" }),
    ];
    const supabase = makeSupabase(rows);

    const asc = await fetchAuditPage(supabase, {}, "created_at", "asc", 0, 50);
    expect(asc.entries.map((e) => e.id)).toEqual(["1", "3", "2"]);

    const desc = await fetchAuditPage(supabase, {}, "created_at", "desc", 0, 50);
    expect(desc.entries.map((e) => e.id)).toEqual(["2", "3", "1"]);
  });

  it("returns nothing when the org_name filter matches no client", async () => {
    const rows = [row({ id: "1", client_id: "org-1" })];
    const supabase = makeSupabase(rows, [{ id: "org-1", name: "Acme" }]);

    const { entries, totalCount } = await fetchAuditPage(
      supabase,
      { org_name: "no-such-client" },
      "created_at",
      "desc",
      0,
      50
    );

    expect(entries).toEqual([]);
    expect(totalCount).toBe(0);
  });
});

describe("fetchAllAuditEntries", () => {
  it("returns every matching row, not just one page's worth", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) =>
      row({
        id: String(i),
        event_type: i % 2 === 0 ? "auth.login" : "org.created",
        created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      })
    );
    const supabase = makeSupabase(rows);

    const all = await fetchAllAuditEntries(supabase, { event_type: "auth.login" }, "created_at", "asc");

    expect(all).toHaveLength(750);
    expect(all.every((e) => e.event_type === "auth.login")).toBe(true);
    // still respects sort order across the batch boundary
    const timestamps = all.map((e) => e.created_at);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it("scopes to a single project and excludes the given event types, for the consultant project-level export", async () => {
    const rows = [
      row({ id: "1", project_id: "proj-1", event_type: "project.submitted" }),
      row({ id: "2", project_id: "proj-1", event_type: "credit.top_up" }),
      row({ id: "3", project_id: "proj-2", event_type: "project.submitted" }),
    ];
    const supabase = makeSupabase(rows);

    const all = await fetchAllAuditEntries(
      supabase,
      { project_id: "proj-1", excluded_event_types: ["credit.top_up", "credit.deduction"] },
      "created_at",
      "asc"
    );

    expect(all.map((e) => e.id)).toEqual(["1"]);
  });
});
