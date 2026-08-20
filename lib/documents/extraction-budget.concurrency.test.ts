// Real integration test for issue #152: fires genuinely concurrent
// supabase.rpc() calls against a locally-running Supabase Postgres and
// asserts claim_extraction_slot actually closes the race a mocked unit test
// can't exercise (a mocked client can't race itself). Mirrors
// lib/payments/ledger.concurrency.test.ts's structure and rationale.
//
// Requires `npx supabase start` with migrations applied. Excluded from the
// default `npm run test` pass (see vitest.config.ts) — run explicitly via
// `npm run test:concurrency`.
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    "extraction-budget.concurrency.test.ts requires SUPABASE_TEST_SERVICE_ROLE_KEY (or " +
      "SUPABASE_SERVICE_ROLE_KEY) pointed at a running `npx supabase start` instance — run " +
      "`npx supabase status -o env` to get it."
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ClaimResult = { status: string; remaining: number | null };

const createdAuthUserIds: string[] = [];

async function createTestUser(): Promise<string> {
  const email = `race-test-${crypto.randomUUID()}@extraction-budget-concurrency.test`;
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

afterAll(async () => {
  if (createdAuthUserIds.length > 0) {
    await supabase.from("extraction_usage_events").delete().in("user_id", createdAuthUserIds);
  }
  for (const id of createdAuthUserIds) {
    await supabase.auth.admin.deleteUser(id).catch(() => {});
  }
});

describe("claim_extraction_slot RPC — concurrency (issue #152)", () => {
  it(
    "N concurrent claims against a limit of N-1: exactly N-1 succeed, exactly one is limit_reached, exactly N-1 events persisted",
    async () => {
      const userId = await createTestUser();
      const limit = 3;
      const concurrentCalls = 4; // one more than the limit

      const results = await Promise.all(
        Array.from({ length: concurrentCalls }, () =>
          supabase.rpc("claim_extraction_slot", { p_user_id: userId, p_limit: limit }).single<ClaimResult>()
        )
      );

      for (const r of results) {
        expect(r.error).toBeNull();
      }

      const statuses = results.map((r) => r.data?.status).sort();
      expect(statuses).toEqual(["limit_reached", "ok", "ok", "ok"]);

      const { data: events } = await supabase
        .from("extraction_usage_events")
        .select("id")
        .eq("user_id", userId);
      expect(events).toHaveLength(limit);
    },
    20_000
  );

  it(
    "two different users racing simultaneously never contend with each other's budget",
    async () => {
      const [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
      const limit = 1;

      const [resultA, resultB] = await Promise.all([
        supabase.rpc("claim_extraction_slot", { p_user_id: userA, p_limit: limit }).single<ClaimResult>(),
        supabase.rpc("claim_extraction_slot", { p_user_id: userB, p_limit: limit }).single<ClaimResult>(),
      ]);

      expect(resultA.error).toBeNull();
      expect(resultB.error).toBeNull();
      expect(resultA.data?.status).toBe("ok");
      expect(resultB.data?.status).toBe("ok");
    },
    20_000
  );
});
