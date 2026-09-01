import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/delivery/public-holidays");
vi.mock("@/lib/settings/business-hours");
vi.mock("@/lib/settings/delivery-delay");
vi.mock("@/lib/documents/delivery");
vi.mock("@/lib/stakeholders/dispatch");

import { scheduleOrDeliverPbdb, scheduleOrDeliverPbdr, expeditePbdbDispatch } from "./pending-delivery";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessHours } from "@/lib/settings/business-hours";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { dispatchPbdb } from "@/lib/stakeholders/dispatch";
import { deliverPbdr } from "@/lib/documents/delivery";

const PROJECT_ID = "proj-1";
const ACTOR_ID = "actor-1";

function mockProject(preset: string) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockResolvedValue({ error: null });
  const client = {
    from: vi.fn((table: string) => {
      if (table === "projects") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.single = () =>
          Promise.resolve({
            data: {
              client_id: "org-1",
              pbdb_delivery_delay_preset: preset,
              delivery_delay_preset: preset,
              clients: { state_territory: "NSW" },
            },
            error: null,
          });
        return chain;
      }
      // pending_deliveries
      const chain: Record<string, unknown> = {};
      chain.upsert = upsert;
      chain.delete = () => chain;
      chain.eq = () => chain;
      // terminal `.eq().eq()` on delete resolves
      chain.then = (fn: (v: unknown) => unknown) => del().then(fn);
      return chain;
    }),
  };
  return { client, upsert, del };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBusinessHours).mockResolvedValue({ start: "09:00", end: "17:00" });
  vi.mocked(getPublicHolidays).mockResolvedValue(new Set<string>());
  vi.mocked(getDeliveryDelayDurations).mockResolvedValue({
    normal: { unit: "workingDays", value: 1 },
    extended: { unit: "workingDays", value: 3 },
  });
  vi.mocked(dispatchPbdb).mockResolvedValue({ stakeholderNames: ["Planner"] });
  vi.mocked(deliverPbdr).mockResolvedValue({ success: true } as never);
});

describe("scheduleOrDeliverPbdb", () => {
  it("expedited dispatches immediately with no business-hours gate", async () => {
    const { client, upsert } = mockProject("expedited");
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    // Force "after hours" so any business-hours gate would defer.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T14:00:00.000Z")); // ~midnight AEST

    const result = await scheduleOrDeliverPbdb(PROJECT_ID, ACTOR_ID);

    vi.useRealTimers();
    expect(dispatchPbdb).toHaveBeenCalledWith(PROJECT_ID, ACTOR_ID);
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: true, scheduledFor: null, stakeholderNames: ["Planner"] });
  });

  it("normal preset stages a pending_deliveries row instead of dispatching", async () => {
    const { client, upsert } = mockProject("normal");
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    const result = await scheduleOrDeliverPbdb(PROJECT_ID, ACTOR_ID);

    expect(dispatchPbdb).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledOnce();
    expect(result.delivered).toBe(false);
    expect(result.scheduledFor).toBeTypeOf("string");
  });
});

describe("scheduleOrDeliverPbdr", () => {
  it("expedited delivers immediately even after hours — overrides the #63 gate", async () => {
    const { client, upsert } = mockProject("expedited");
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    // Force "after hours" so a business-hours gate would otherwise defer to 9am.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T14:00:00.000Z")); // ~midnight AEST

    const result = await scheduleOrDeliverPbdr(PROJECT_ID, ACTOR_ID, "actor@example.com");

    vi.useRealTimers();
    expect(deliverPbdr).toHaveBeenCalledWith(PROJECT_ID, ACTOR_ID, "actor@example.com");
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: true, scheduledFor: null });
  });

  it("normal preset stages a pending_deliveries row instead of delivering", async () => {
    const { client, upsert } = mockProject("normal");
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    const result = await scheduleOrDeliverPbdr(PROJECT_ID, ACTOR_ID, "actor@example.com");

    expect(deliverPbdr).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledOnce();
    expect(result.delivered).toBe(false);
    expect(result.scheduledFor).toBeTypeOf("string");
  });
});

describe("expeditePbdbDispatch", () => {
  it("clears the pending row and dispatches now", async () => {
    const { client, del } = mockProject("normal");
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    const result = await expeditePbdbDispatch(PROJECT_ID, ACTOR_ID);

    expect(del).toHaveBeenCalled();
    expect(dispatchPbdb).toHaveBeenCalledWith(PROJECT_ID, ACTOR_ID);
    expect(result).toEqual({ delivered: true, scheduledFor: null });
  });
});
