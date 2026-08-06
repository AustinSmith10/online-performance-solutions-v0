import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");

import { resolveFieldFlag, resolveAndAcknowledgeFieldFlag, acknowledgeFieldFlag } from "./field-flags";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";

const ACTOR = { id: "consultant-1", email: "consultant@ddeg.com.au", role: "consultant" };

const OPEN_FLAG = {
  id: "flag-1",
  project_id: "proj-1",
  field_key: "EXTRACT_PO",
  status: "open",
  resolved_by: null,
  resolved_at: null,
  current_value: "OLD-1",
};

const RESOLVED_FLAG = {
  id: "flag-1",
  project_id: "proj-1",
  field_key: "EXTRACT_PO",
  status: "resolved",
  resolved_by: "other-user",
  resolved_at: "2026-01-01T00:00:00.000Z",
  current_value: "PREV-VALUE",
};

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error, count });
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.update = self;
  obj.single = resolve;
  obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

function buildMock({
  flagRow = OPEN_FLAG as Record<string, unknown>,
  updateCount = 1,
  priorResolverEmail = "prior@ddeg.com.au",
} = {}) {
  const calls: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    calls[table] = (calls[table] ?? 0) + 1;
    const n = calls[table];

    if (table === "field_flags") {
      if (n === 1) return chain(flagRow); // initial select
      // update call
      return chain(null, null, updateCount);
    }

    if (table === "users") {
      return chain({ email: priorResolverEmail });
    }

    if (table === "projects") {
      if (n === 1) return chain({ status: "in_progress" }); // projectForStage
      // extracted_fields sync select then update
      if (n === 2) return chain({ extracted_fields: {}, site_address: null });
      return chain(null);
    }

    return chain(null);
  });

  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(ACTOR as never);
  vi.mocked(auditLog).mockResolvedValue(undefined as never);
});

describe("resolveFieldFlag — audit logging", () => {
  it("writes a field_flag.resolved audit row on a normal resolution", async () => {
    const mock = buildMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await resolveFieldFlag("flag-1", {
      value: "NEW-1",
      reason: "self_resolved",
      note: "looks right",
    });

    expect(result.ok).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(
      "field_flag.resolved",
      ACTOR.id,
      ACTOR.email,
      expect.objectContaining({
        projectId: "proj-1",
        metadata: expect.objectContaining({
          flagId: "flag-1",
          fieldKey: "EXTRACT_PO",
          value: "NEW-1",
          reason: "self_resolved",
          note: "looks right",
        }),
      })
    );
  });

  it("includes the prior value and resolver on a force conflict-override", async () => {
    const mock = buildMock({ flagRow: RESOLVED_FLAG });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await resolveFieldFlag("flag-1", {
      value: "OVERRIDE-VALUE",
      reason: "resolved_independently",
      force: true,
    });

    expect(result.ok).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(
      "field_flag.resolved",
      ACTOR.id,
      ACTOR.email,
      expect.objectContaining({
        metadata: expect.objectContaining({
          value: "OVERRIDE-VALUE",
          priorValue: "PREV-VALUE",
          priorResolvedBy: "other-user",
          priorResolvedByEmail: "prior@ddeg.com.au",
          priorResolvedAt: "2026-01-01T00:00:00.000Z",
        }),
      })
    );
  });

  it("does not log when the update hits a conflict (count 0) instead of resolving", async () => {
    const mock = buildMock({ updateCount: 0, flagRow: OPEN_FLAG });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await resolveFieldFlag("flag-1", { value: "NEW-1", reason: "self_resolved" });

    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe("resolveAndAcknowledgeFieldFlag — merged resolve+acknowledge (#116)", () => {
  it("resolves and acknowledges in one update, writing both audit events", async () => {
    const updateCalls: Record<string, unknown>[] = [];
    const from = vi.fn((table: string) => {
      if (table === "field_flags") {
        const obj: Record<string, unknown> = {};
        const self = () => obj;
        obj.select = self;
        obj.eq = self;
        obj.maybeSingle = () => Promise.resolve({ data: OPEN_FLAG, error: null });
        obj.update = (fields: Record<string, unknown>) => {
          updateCalls.push(fields);
          return chain(null, null, 1);
        };
        return obj;
      }
      if (table === "projects") {
        return chain({ status: "in_progress", extracted_fields: {}, site_address: null });
      }
      return chain(null);
    });
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);

    const result = await resolveAndAcknowledgeFieldFlag("flag-1", {
      value: "NEW-1",
      reason: "self_resolved",
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      status: "resolved",
      current_value: "NEW-1",
      consultant_acknowledged_by: ACTOR.id,
    });
    expect(updateCalls[0].consultant_acknowledged_at).toBeTruthy();

    expect(auditLog).toHaveBeenCalledWith(
      "field_flag.resolved",
      ACTOR.id,
      ACTOR.email,
      expect.objectContaining({ metadata: expect.objectContaining({ value: "NEW-1" }) })
    );
    expect(auditLog).toHaveBeenCalledWith(
      "field_flag.acknowledged",
      ACTOR.id,
      ACTOR.email,
      expect.objectContaining({
        metadata: expect.objectContaining({ fieldKey: "EXTRACT_PO", acknowledgedValue: "NEW-1" }),
      })
    );
  });
});

describe("acknowledgeFieldFlag — audit logging", () => {
  it("writes a field_flag.acknowledged audit row", async () => {
    const from = vi.fn((table: string) => {
      if (table === "field_flags") {
        return chain({ project_id: "proj-1", field_key: "EXTRACT_PO", current_value: "OLD-1" });
      }
      return chain(null);
    });
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);

    const result = await acknowledgeFieldFlag("flag-1");

    expect(result.ok).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(
      "field_flag.acknowledged",
      ACTOR.id,
      ACTOR.email,
      expect.objectContaining({
        projectId: "proj-1",
        metadata: expect.objectContaining({
          flagId: "flag-1",
          fieldKey: "EXTRACT_PO",
          projectId: "proj-1",
          acknowledgedValue: "OLD-1",
        }),
      })
    );
  });
});
