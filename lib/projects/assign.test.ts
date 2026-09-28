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

function buildMock({
  projectSuffix = "S",
  consultantDisciplines = ["S"],
}: { projectSuffix?: string | null; consultantDisciplines?: string[] | null } = {}) {
  const project = {
    id: PROJECT_ID,
    project_number: "OPS-1",
    site_address: "123 Test St",
    extracted_fields: null,
    status: "submitted",
    client_id: "org-1",
    expected_delivery_date: "2026-01-10",
    clients: { name: "Acme", delivery_working_days: 5, state_territory: "NSW" },
    templates: { number_suffix: projectSuffix },
  };
  const consultant = {
    id: CONSULTANT_ID,
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@x.com",
    disciplines: consultantDisciplines,
  };

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

function mockWith(opts: Parameters<typeof buildMock>[0]) {
  vi.mocked(createAdminClient).mockReturnValue(buildMock(opts) as never);
}

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

describe("performAssignment — discipline gate", () => {
  it("rejects a consultant not tagged for the project's discipline, admin push or self-assign alike", async () => {
    mockWith({ projectSuffix: "F", consultantDisciplines: ["S"] });
    await expect(performAssignment(PROJECT_ID, CONSULTANT_ID, ADMIN_ID, "admin@x.com")).rejects.toThrow(/Fire/);
    await expect(performAssignment(PROJECT_ID, CONSULTANT_ID, CONSULTANT_ID, "jane@x.com")).rejects.toThrow(/Fire/);
  });

  it("allows a consultant tagged with the matching discipline among several", async () => {
    mockWith({ projectSuffix: "A", consultantDisciplines: ["S", "A", "F"] });
    await expect(performAssignment(PROJECT_ID, CONSULTANT_ID, ADMIN_ID, "admin@x.com")).resolves.toBeUndefined();
  });

  it("rejects an untagged consultant (no disciplines row)", async () => {
    mockWith({ projectSuffix: "S", consultantDisciplines: null });
    await expect(performAssignment(PROJECT_ID, CONSULTANT_ID, ADMIN_ID, "admin@x.com")).rejects.toThrow(/Solutions/);
  });

  it("treats a project with no template row as Solutions", async () => {
    mockWith({ projectSuffix: null, consultantDisciplines: ["S"] });
    await expect(performAssignment(PROJECT_ID, CONSULTANT_ID, ADMIN_ID, "admin@x.com")).resolves.toBeUndefined();
  });
});
