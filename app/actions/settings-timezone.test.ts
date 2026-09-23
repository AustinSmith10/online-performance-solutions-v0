import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/settings/timezone", async (orig) => ({
  ...(await orig<typeof import("@/lib/settings/timezone")>()),
  getBusinessTimezone: vi.fn(),
  setBusinessTimezone: vi.fn(),
}));

import { updateBusinessTimezoneAction } from "./settings";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { getBusinessTimezone, setBusinessTimezone } from "@/lib/settings/timezone";

function form(timeZone: string) {
  const fd = new FormData();
  fd.set("timeZone", timeZone);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: "sa-1", email: "sa@ddeg.com.au", role: "super_admin" } as never);
  vi.mocked(createAdminClient).mockReturnValue({} as never);
  vi.mocked(getBusinessTimezone).mockResolvedValue("Australia/Brisbane");
  vi.mocked(setBusinessTimezone).mockResolvedValue({});
});

describe("updateBusinessTimezoneAction", () => {
  it("is super_admin only", async () => {
    await updateBusinessTimezoneAction({}, form("Australia/Perth"));
    expect(requireRole).toHaveBeenCalledWith("super_admin");
  });

  it("saves the zone and audit-logs the change", async () => {
    const result = await updateBusinessTimezoneAction({}, form("Australia/Perth"));

    expect(result).toEqual({ saved: true });
    expect(setBusinessTimezone).toHaveBeenCalledWith({}, "Australia/Perth", "sa-1");
    expect(auditLog).toHaveBeenCalledWith("settings.business_timezone_updated", "sa-1", "sa@ddeg.com.au", {
      metadata: { from: "Australia/Brisbane", to: "Australia/Perth" },
    });
  });

  it("does not audit-log a rejected value", async () => {
    vi.mocked(setBusinessTimezone).mockResolvedValue({ error: "Choose an Australian timezone from the list." });

    const result = await updateBusinessTimezoneAction({}, form("UTC"));

    expect(result.errors?.form?.[0]).toMatch(/Australian timezone/);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
