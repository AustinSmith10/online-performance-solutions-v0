import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/email/templates/ConsultantAssignedEmail", () => ({
  ConsultantAssignedEmail: vi.fn(() => "<p>email</p>"),
}));
vi.mock("@/lib/delivery/public-holidays", () => ({ getPublicHolidays: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/delivery/working-days", () => ({ addWorkingDays: vi.fn(() => new Date("2026-01-01")) }));

import { performAssignment } from "./assign";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";

const PROJECT_ID = "proj-1";
const CONSULTANT_ID = "consultant-1";
const ADMIN_ID = "admin-1";

function buildMock() {
  const project = {
    id: PROJECT_ID,
    project_number: "OPS-1",
    site_address: "123 Test St",
    extracted_fields: null,
    status: "submitted",
    client_id: "org-1",
    expected_delivery_date: "2026-01-10",
    clients: { name: "Acme", delivery_working_days: 5, state_territory: "NSW" },
  };
  const consultant = { id: CONSULTANT_ID, first_name: "Jane", last_name: "Doe", email: "jane@x.com" };

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    if (table === "users") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: consultant, error: null }),
      };
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn() };
  });

  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(notify).mockResolvedValue(undefined);
  vi.mocked(createAdminClient).mockReturnValue(buildMock() as never);
});

describe("performAssignment — consultant-assigned email notification", () => {
  it("notifies the consultant when an admin assigns them a project", async () => {
    await performAssignment(PROJECT_ID, CONSULTANT_ID, ADMIN_ID, "admin@x.com");

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: CONSULTANT_ID, type: "consultant_assigned" })
    );
  });

  it("does not notify when the consultant self-assigns", async () => {
    await performAssignment(PROJECT_ID, CONSULTANT_ID, CONSULTANT_ID, "jane@x.com");

    expect(notify).not.toHaveBeenCalled();
  });
});
