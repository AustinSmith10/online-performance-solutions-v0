// Real integration test for issue #103: fires genuinely concurrent
// supabase.rpc() calls against a locally-running Supabase Postgres and
// asserts the atomic RPCs actually close the races the mocked unit tests
// in ledger.test.ts can't exercise (a mocked client can't race itself).
//
// Requires `npx supabase start` with migrations applied. Excluded from the
// default `npm run test` pass (see vitest.config.ts) — run explicitly via
// `npm run test:concurrency`, which is what CI does as a separate job.
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// The service_role key is per-project (`npx supabase status -o env` after
// `npx supabase start`) — recent Supabase CLI versions mint a fresh
// sb_secret_... key per project rather than a shared demo JWT, so there's no
// safe hardcoded fallback. Set SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY
// (or reuse NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local)
// before running `npm run test:concurrency`.
const SUPABASE_URL =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    "ledger.concurrency.test.ts requires SUPABASE_TEST_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) " +
      "pointed at a running `npx supabase start` instance — run `npx supabase status -o env` to get it."
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type DeductResult = { status: string; new_balance: number | null };

// ── test-data helpers ───────────────────────────────────────────────────────
// projects.submitted_by -> users.id -> auth.users.id (cascading FK), so every
// scenario needs a real auth user underneath the client/project rows it creates.

const createdAuthUserIds: string[] = [];
const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];

async function createTestUser(): Promise<string> {
  const email = `race-test-${crypto.randomUUID()}@ledger-concurrency.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: `Test-${crypto.randomUUID()}`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Failed to create test auth user: ${error?.message}`);
  createdAuthUserIds.push(data.user.id);

  const { error: userRowError } = await supabase
    .from("users")
    .insert({ id: data.user.id, email, role: "stakeholder" });
  if (userRowError) throw new Error(`Failed to create test users row: ${userRowError.message}`);

  return data.user.id;
}

async function createTestClient(creditBalance: number): Promise<string> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: "Ledger Concurrency Test Co",
      slug: `ledger-race-test-${crypto.randomUUID()}`,
      payment_method: "credit_deduction",
      credit_balance: creditBalance,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create test client: ${error?.message}`);
  createdClientIds.push(data.id as string);
  return data.id as string;
}

async function createTestProject(clientId: string, submittedBy: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ client_id: clientId, submitted_by: submittedBy })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create test project: ${error?.message}`);
  createdProjectIds.push(data.id as string);
  return data.id as string;
}

afterAll(async () => {
  if (createdProjectIds.length > 0) {
    await supabase.from("credit_ledger").delete().in("project_id", createdProjectIds);
    await supabase.from("credit_race_events").delete().in("project_id", createdProjectIds);
    await supabase.from("projects").delete().in("id", createdProjectIds);
  }
  if (createdClientIds.length > 0) {
    await supabase.from("credit_ledger").delete().in("client_id", createdClientIds);
    await supabase.from("clients").delete().in("id", createdClientIds);
  }
  for (const id of createdAuthUserIds) {
    await supabase.auth.admin.deleteUser(id).catch(() => {});
  }
});

describe("deduct_credit RPC — concurrency (issue #103)", () => {
  it(
    "two different projects racing the same client's balance: exactly one deducts, balance never goes negative",
    async () => {
      const submittedBy = await createTestUser();
      const clientId = await createTestClient(1);
      const [projectA, projectB] = await Promise.all([
        createTestProject(clientId, submittedBy),
        createTestProject(clientId, submittedBy),
      ]);

      const [resultA, resultB] = await Promise.all([
        supabase
          .rpc("deduct_credit", { p_client_id: clientId, p_project_id: projectA, p_performed_by: submittedBy })
          .single<DeductResult>(),
        supabase
          .rpc("deduct_credit", { p_client_id: clientId, p_project_id: projectB, p_performed_by: submittedBy })
          .single<DeductResult>(),
      ]);

      expect(resultA.error).toBeNull();
      expect(resultB.error).toBeNull();

      const statuses = [resultA.data?.status, resultB.data?.status].sort();
      expect(statuses).toEqual(["insufficient_balance", "ok"]);

      const { data: finalClient } = await supabase
        .from("clients")
        .select("credit_balance")
        .eq("id", clientId)
        .single();
      expect(finalClient?.credit_balance).toBe(0);

      const { data: ledgerRows } = await supabase
        .from("credit_ledger")
        .select("id")
        .eq("client_id", clientId);
      expect(ledgerRows).toHaveLength(1);
    },
    20_000
  );

  it(
    "the same project deducted twice concurrently (duplicate webhook/retry): exactly one deduction lands, the other reports already_deducted",
    async () => {
      const submittedBy = await createTestUser();
      const clientId = await createTestClient(5);
      const projectId = await createTestProject(clientId, submittedBy);

      const [r1, r2] = await Promise.all([
        supabase
          .rpc("deduct_credit", { p_client_id: clientId, p_project_id: projectId, p_performed_by: submittedBy })
          .single<DeductResult>(),
        supabase
          .rpc("deduct_credit", { p_client_id: clientId, p_project_id: projectId, p_performed_by: submittedBy })
          .single<DeductResult>(),
      ]);

      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();

      const statuses = [r1.data?.status, r2.data?.status].sort();
      expect(statuses).toEqual(["already_deducted", "ok"]);

      const { data: finalClient } = await supabase
        .from("clients")
        .select("credit_balance")
        .eq("id", clientId)
        .single();
      expect(finalClient?.credit_balance).toBe(4);

      const { data: ledgerRows } = await supabase
        .from("credit_ledger")
        .select("id")
        .eq("project_id", projectId);
      expect(ledgerRows).toHaveLength(1);
    },
    20_000
  );
});
