import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkSchemaDrift } from "./drift-guard";
import { EXPECTED_SCHEMA_MIGRATION } from "./expected-migration";

function mockSupabase(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) } as never;
}

describe("checkSchemaDrift", () => {
  it("ok when remote is at the expected version", async () => {
    const r = await checkSchemaDrift(mockSupabase({ data: EXPECTED_SCHEMA_MIGRATION, error: null }));
    expect(r.ok).toBe(true);
    expect(r.actual).toBe(EXPECTED_SCHEMA_MIGRATION);
  });

  it("ok when remote is ahead of the expected version", async () => {
    const ahead = "99999999999999";
    const r = await checkSchemaDrift(mockSupabase({ data: ahead, error: null }));
    expect(r.ok).toBe(true);
  });

  it("NOT ok (fail-closed) when remote is behind", async () => {
    const r = await checkSchemaDrift(mockSupabase({ data: "00000000000001", error: null }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/behind/);
  });

  it("fails open when the RPC errors (e.g. not deployed yet)", async () => {
    const r = await checkSchemaDrift(mockSupabase({ data: null, error: { message: "function does not exist" } }));
    expect(r.ok).toBe(true);
  });

  it("fails open when the remote has no migrations recorded", async () => {
    const r = await checkSchemaDrift(mockSupabase({ data: null, error: null }));
    expect(r.ok).toBe(true);
  });
});
