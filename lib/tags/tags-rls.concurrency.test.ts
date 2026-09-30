// Real-database test for the tag tables' row-level security (#211). Mocks
// can't prove RLS, so this drives a real session per role against a
// locally-running Supabase Postgres, exactly like the other *.concurrency
// tests: requires `npx supabase start`, excluded from `npm test`, run via
// `npm run test:concurrency`.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const SUPABASE_URL =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!SERVICE_ROLE_KEY) {
  throw new Error("tags-rls.concurrency.test.ts requires SUPABASE_TEST_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
}

// This test creates and deletes real auth users — refuse to run against anything
// but a local stack (a developer's .env.local may point at a hosted project).
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(SUPABASE_URL)) {
  throw new Error(`tags-rls.concurrency.test.ts only runs against a local Supabase (got ${new URL(SUPABASE_URL).host}). Set SUPABASE_TEST_URL.`);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Role = "super_admin" | "admin" | "consultant" | "stakeholder";
const ROLES: Role[] = ["super_admin", "admin", "consultant", "stakeholder"];
const userIds = {} as Record<Role, string>;
const createdAuthUserIds: string[] = [];
let tagId: string;
let db: Client;

async function createUser(role: Role): Promise<string> {
  const email = `tags-rls-${role}-${crypto.randomUUID()}@tags.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: `Test-${crypto.randomUUID()}`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`auth user: ${error?.message}`);
  createdAuthUserIds.push(data.user.id);
  const { error: rowErr } = await supabase.from("users").insert({ id: data.user.id, email, role });
  if (rowErr) throw new Error(`users row: ${rowErr.message}`);
  return data.user.id;
}

/** Runs `fn` as the `authenticated` DB role with auth.uid() = the given user, then rolls back. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function asUser<T>(role: Role, fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }>) => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE authenticated");
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userIds[role], role: "authenticated" }),
    ]);
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    await db.query("ROLLBACK");
  }
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
  await db.connect();
  for (const role of ROLES) userIds[role] = await createUser(role);
  const { data, error } = await supabase
    .from("tags")
    .insert({ name: `rls-${crypto.randomUUID().slice(0, 8)}`, color: "#112233" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`tag: ${error?.message}`);
  tagId = data.id as string;
  await supabase.from("account_tags").insert({ tag_id: tagId, user_id: userIds.stakeholder });
});

afterAll(async () => {
  await supabase.from("tags").delete().eq("id", tagId);
  for (const id of createdAuthUserIds) await supabase.auth.admin.deleteUser(id);
  await db?.end();
});

describe("tags / account_tags row-level security (#211)", () => {
  it.each(["super_admin", "admin", "consultant"] as Role[])("%s can read tags and assignments", async (role) => {
    await asUser(role, async (q) => {
      expect((await q("SELECT id FROM tags WHERE id = $1", [tagId])).rows).toHaveLength(1);
      expect((await q("SELECT 1 FROM account_tags WHERE tag_id = $1", [tagId])).rows).toHaveLength(1);
    });
  });

  it("a stakeholder session can read neither tags nor any assignment — including their own", async () => {
    await asUser("stakeholder", async (q) => {
      expect((await q("SELECT id FROM tags")).rows).toHaveLength(0);
      expect((await q("SELECT 1 FROM account_tags")).rows).toHaveLength(0);
      expect((await q("SELECT 1 FROM account_tags WHERE user_id = $1", [userIds.stakeholder])).rows).toHaveLength(0);
    });
  });

  it.each(["admin", "consultant", "stakeholder"] as Role[])("%s cannot create, rename or delete a tag directly", async (role) => {
    await asUser(role, async (q) => {
      await expect(q("INSERT INTO tags (name, color) VALUES ('nope', '#000000')")).rejects.toThrow(/row-level security/);
    });
    await asUser(role, async (q) => {
      // No UPDATE/DELETE policy matches: zero rows affected rather than an error.
      expect((await q("UPDATE tags SET name = 'renamed' WHERE id = $1 RETURNING id", [tagId])).rows).toHaveLength(0);
      expect((await q("DELETE FROM tags WHERE id = $1 RETURNING id", [tagId])).rows).toHaveLength(0);
    });
  });

  it("the super admin can create, rename and delete a tag directly", async () => {
    await asUser("super_admin", async (q) => {
      const created = await q("INSERT INTO tags (name, color) VALUES ($1, '#abcdef') RETURNING id", [`sa-${crypto.randomUUID().slice(0, 8)}`]);
      const id = created.rows[0].id;
      expect((await q("UPDATE tags SET name = $2 WHERE id = $1 RETURNING id", [id, `sb-${crypto.randomUUID().slice(0, 8)}`])).rows).toHaveLength(1);
      expect((await q("DELETE FROM tags WHERE id = $1 RETURNING id", [id])).rows).toHaveLength(1);
    });
  });

  it("deleting a tag removes its assignments", async () => {
    const { data: tag } = await supabase
      .from("tags")
      .insert({ name: `cas-${crypto.randomUUID().slice(0, 8)}`, color: "#445566" })
      .select("id")
      .single();
    await supabase.from("account_tags").insert({ tag_id: tag!.id, user_id: userIds.consultant });
    await supabase.from("tags").delete().eq("id", tag!.id);
    const { data } = await supabase.from("account_tags").select("tag_id").eq("tag_id", tag!.id);
    expect(data).toEqual([]);
  });

  it("rejects a malformed colour and a case-insensitive duplicate name", async () => {
    const name = `dup-${crypto.randomUUID().slice(0, 8)}`;
    const bad = await supabase.from("tags").insert({ name, color: "red" });
    expect(bad.error).not.toBeNull();
    const first = await supabase.from("tags").insert({ name, color: "#000000" }).select("id").single();
    expect(first.error).toBeNull();
    const dup = await supabase.from("tags").insert({ name: name.toUpperCase(), color: "#000000" });
    expect(dup.error?.code).toBe("23505");
    await supabase.from("tags").delete().eq("id", first.data!.id);
  });
});
