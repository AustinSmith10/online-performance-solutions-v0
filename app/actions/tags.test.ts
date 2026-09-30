import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");

import { createTag, updateTag, deleteTag, assignTag, unassignTag } from "./tags";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let patch: Row = {};
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Row) => ((mode = "insert"), (patch = v), b),
      upsert: (v: Row) => ((mode = "upsert"), (patch = v), b),
      update: (v: Row) => ((mode = "update"), (patch = v), b),
      delete: () => ((mode = "delete"), b),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      single: () => run(true),
      maybeSingle: () => run(true),
      then: (resolve: (v: unknown) => unknown) => run(false).then(resolve),
    };
    async function run(one: boolean) {
      const rows = (tables[table] ??= []);
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === "insert" || mode === "upsert") {
        rows.push({ id: `${table}-${rows.length}`, ...patch });
        return { data: one ? { id: `${table}-${rows.length - 1}` } : null, error: null };
      }
      if (mode === "update") matched.forEach((r) => Object.assign(r, patch));
      if (mode === "delete") tables[table] = rows.filter((r) => !matched.includes(r));
      return { data: one ? (matched[0] ?? null) : matched, error: null };
    }
    return b;
  }
  return { from } as never;
}

function actAs(role: string, id = role) {
  vi.mocked(requireRole).mockImplementation(async (...roles: string[]) => {
    if (!roles.includes(role)) throw new Error("NEXT_REDIRECT");
    return { id, role, email: `${id}@x.com` } as never;
  });
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries(o).forEach(([k, v]) => f.set(k, v));
  return f;
};

let tables: Record<string, Row[]>;
beforeEach(() => {
  vi.clearAllMocks();
  tables = {
    tags: [{ id: "t1", name: "VIP", color: "#111111" }],
    users: [
      { id: "sa", role: "super_admin" },
      { id: "adm", role: "admin" },
      { id: "c1", role: "consultant" },
      { id: "c2", role: "consultant" },
      { id: "s1", role: "stakeholder" },
    ],
    account_tags: [],
  };
  vi.mocked(createAdminClient).mockReturnValue(fakeDb(tables));
});

describe("tag manager is super-admin only (#211)", () => {
  it.each(["admin", "consultant", "stakeholder"])("%s is turned away from create/update/delete", async (role) => {
    actAs(role);
    await expect(createTag({}, fd({ name: "X", color: "#000000" }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(updateTag("t1", {}, fd({ name: "X", color: "#000000" }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(deleteTag("t1")).rejects.toThrow("NEXT_REDIRECT");
    expect(tables.tags).toHaveLength(1);
  });

  it("super admin can create, recolour/rename and delete", async () => {
    actAs("super_admin", "sa");
    expect(await createTag({}, fd({ name: "Manager", color: "#00ff00" }))).toEqual({ success: true });
    expect(tables.tags.map((t) => t.name)).toContain("Manager");
    expect(await updateTag("t1", {}, fd({ name: "VIP+", color: "#222222" }))).toEqual({ success: true });
    expect(tables.tags[0]).toMatchObject({ name: "VIP+", color: "#222222" });
    expect(await deleteTag("t1")).toEqual({ success: true });
    expect(tables.tags.find((t) => t.id === "t1")).toBeUndefined();
  });

  it("validates input", async () => {
    actAs("super_admin", "sa");
    expect(await createTag({}, fd({ name: "", color: "#000000" }))).toHaveProperty("error");
    expect(await createTag({}, fd({ name: "ok", color: "javascript:1" }))).toHaveProperty("error");
  });
});

describe("assigning tags follows the role rules server-side (#213)", () => {
  it.each([
    ["super_admin", "sa", "adm", true],
    ["super_admin", "sa", "s1", true],
    ["admin", "adm", "s1", true],
    ["admin", "adm", "c1", true],
    ["admin", "adm", "sa", false],
    ["consultant", "c1", "s1", true],
    ["consultant", "c1", "c1", true],
    ["consultant", "c1", "c2", false],
    ["consultant", "c1", "adm", false],
  ])("%s (%s) → %s allowed=%s", async (role, actorId, targetId, allowed) => {
    actAs(role, actorId);
    const result = await assignTag("t1", targetId);
    if (allowed) {
      expect(result).toEqual({ success: true });
      expect(tables.account_tags).toHaveLength(1);
    } else {
      expect(result.error).toMatch(/can't tag/);
      expect(tables.account_tags).toHaveLength(0);
    }
  });

  it("stakeholders cannot assign or unassign at all", async () => {
    actAs("stakeholder", "s1");
    await expect(assignTag("t1", "s1")).rejects.toThrow("NEXT_REDIRECT");
    await expect(unassignTag("t1", "s1")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("unassign applies the same rules", async () => {
    tables.account_tags.push({ tag_id: "t1", user_id: "c2" });
    actAs("consultant", "c1");
    expect((await unassignTag("t1", "c2")).error).toMatch(/can't change/);
    expect(tables.account_tags).toHaveLength(1);
    actAs("admin", "adm");
    expect(await unassignTag("t1", "c2")).toEqual({ success: true });
    expect(tables.account_tags).toHaveLength(0);
  });
});
