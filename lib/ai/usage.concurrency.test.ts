// Real-Postgres check of the AI usage log (migration 144): the service role can
// write and aggregate it, and the browser roles (anon) can do neither — nor
// reach the credit RPCs that migration 143 locked down.
//
// Needs `npx supabase start` with migrations applied; run via
// `npm run test:concurrency` (CI job "Ledger concurrency").
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error(
    "usage.concurrency.test.ts requires SUPABASE_TEST_SERVICE_ROLE_KEY and SUPABASE_TEST_ANON_KEY " +
      "(from `npx supabase status -o env`)."
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const RUN = `test-${Date.now()}`;
const FEATURE_A = `${RUN}-extraction`;
const FEATURE_B = `${RUN}-judge`;

afterAll(async () => {
  await admin.from("ai_usage_events").delete().like("feature", `${RUN}-%`);
});

describe("ai_usage_events", () => {
  it("the service role can insert rows and ai_usage_summary aggregates them per feature/model", async () => {
    const rows = [
      { feature: FEATURE_A, model: "claude-sonnet-5-5", input_tokens: 1000, output_tokens: 100 },
      { feature: FEATURE_A, model: "claude-sonnet-5-5", input_tokens: 2000, output_tokens: 200 },
      { feature: FEATURE_B, model: "claude-haiku-4-5-20251001", input_tokens: 50, output_tokens: 5 },
    ];
    const { error: insertError } = await admin.from("ai_usage_events").insert(rows);
    expect(insertError).toBeNull();

    const since = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await admin.rpc("ai_usage_summary", { p_since: since });
    expect(error).toBeNull();

    const mine = (data ?? []).filter((r: { feature: string }) => r.feature.startsWith(RUN));
    const a = mine.find((r: { feature: string }) => r.feature === FEATURE_A);
    const b = mine.find((r: { feature: string }) => r.feature === FEATURE_B);
    expect(Number(a.calls)).toBe(2);
    expect(Number(a.input_tokens)).toBe(3000);
    expect(Number(a.output_tokens)).toBe(300);
    expect(Number(b.calls)).toBe(1);
  });

  it("excludes rows older than the requested window", async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("ai_usage_events").insert({
      feature: `${RUN}-old`,
      model: "none",
      created_at: old,
    });
    const { data } = await admin.rpc("ai_usage_summary", {
      p_since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect((data ?? []).some((r: { feature: string }) => r.feature === `${RUN}-old`)).toBe(false);
  });

  it("anon cannot insert into or read the table", async () => {
    const insert = await anon.from("ai_usage_events").insert({ feature: `${RUN}-anon`, model: "x" });
    expect(insert.error).not.toBeNull();

    const read = await anon.from("ai_usage_events").select("id").limit(1);
    expect(read.error).not.toBeNull();
  });

  it("anon cannot call the summary RPC or the credit RPCs locked down in migration 143", async () => {
    const summary = await anon.rpc("ai_usage_summary", { p_since: new Date().toISOString() });
    expect(summary.error).not.toBeNull();

    const topUp = await anon.rpc("top_up_credit", {
      p_client_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 1,
      p_performed_by: "00000000-0000-0000-0000-000000000000",
      p_notes: "should be denied",
    });
    expect(topUp.error).not.toBeNull();
    expect(topUp.error?.code).toBe("42501");
  });
});
