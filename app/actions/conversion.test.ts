import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/stakeholders/tokens");
vi.mock("@/lib/documents/delivery");
vi.mock("@/lib/documents/pending-delivery");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/email/sender");
vi.mock("@/lib/email/templates/PBDRDeliveryEmail");

import { resendPbdrEmail, triggerPbdrConversion } from "./conversion";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleOrDeliverPbdr } from "@/lib/documents/pending-delivery";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/sender";
import { redirect } from "next/navigation";
import { computeSignedUrlExpirySeconds } from "@/lib/stakeholders/tokens";

const PROJECT_ID = "proj-1";
const ADMIN = { id: "admin-1", email: "admin@ddeg.com.au", role: "super_admin" };

function queryable(rows: Record<string, unknown>[]) {
  let filtered = [...rows];
  let orderCol: string | null = null;
  let ascending = true;
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return builder;
    },
    is: () => builder,
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col;
      ascending = opts?.ascending ?? true;
      return builder;
    },
    limit: (n: number) => {
      if (orderCol) {
        const col = orderCol;
        filtered = [...filtered].sort((a, b) =>
          ascending ? (a[col] as number) - (b[col] as number) : (b[col] as number) - (a[col] as number)
        );
      }
      filtered = filtered.slice(0, n);
      return builder;
    },
    maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
  };
  return builder;
}

function buildMock({
  project,
  pbdrRows,
  signedUrl = "https://signed.example/pbdr.pdf",
  submitterEmail = "submitter@example.com",
}: {
  project: Record<string, unknown> | null;
  pbdrRows: Record<string, unknown>[];
  signedUrl?: string | null;
  submitterEmail?: string;
}) {
  const createSignedUrlFn = vi
    .fn()
    .mockResolvedValue({ data: signedUrl ? { signedUrl } : null, error: null });

  const from = vi.fn((table: string) => {
    if (table === "projects") return queryable(project ? [project] : []);
    if (table === "project_files") return queryable(pbdrRows);
    if (table === "users") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "sub-1", email: submitterEmail, first_name: "Jane", last_name: "Doe" },
          error: null,
        }),
      };
    }
    return queryable([]);
  });

  return {
    from,
    storage: { from: vi.fn().mockReturnValue({ createSignedUrl: createSignedUrlFn }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
  vi.mocked(auditLog).mockResolvedValue(undefined as never);
  vi.mocked(notify).mockResolvedValue(undefined as never);
  vi.mocked(sendEmail).mockResolvedValue(true as never);
  vi.mocked(computeSignedUrlExpirySeconds).mockResolvedValue(14 * 24 * 3600);
});

describe("triggerPbdrConversion", () => {
  it("passes the acting admin through to scheduleOrDeliverPbdr and reports immediate delivery", async () => {
    vi.mocked(scheduleOrDeliverPbdr).mockResolvedValue({ delivered: true, scheduledFor: null });

    const result = await triggerPbdrConversion(PROJECT_ID, {}, new FormData());

    expect(vi.mocked(scheduleOrDeliverPbdr)).toHaveBeenCalledWith(PROJECT_ID, ADMIN.id, ADMIN.email);
    expect(result).toEqual({ success: true, scheduledFor: null });
  });

  it("surfaces a staged delivery time when the preset delays it", async () => {
    const scheduledFor = "2026-08-01T00:00:00.000Z";
    vi.mocked(scheduleOrDeliverPbdr).mockResolvedValue({ delivered: false, scheduledFor });

    const result = await triggerPbdrConversion(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ success: true, scheduledFor });
  });

  it("returns an error when scheduleOrDeliverPbdr throws", async () => {
    vi.mocked(scheduleOrDeliverPbdr).mockRejectedValue(new Error("Not all stakeholders have acknowledged."));

    const result = await triggerPbdrConversion(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "Not all stakeholders have acknowledged." });
  });

  it("blocks a consultant who isn't assigned to the project", async () => {
    const CONSULTANT = { id: "consultant-1", email: "consultant@ddeg.com.au", role: "consultant" };
    vi.mocked(requireRole).mockResolvedValue(CONSULTANT as never);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(queryable([{ id: PROJECT_ID, assigned_consultant_id: "someone-else" }])),
    } as never);

    const result = await triggerPbdrConversion(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "You are not assigned to this project." });
    expect(vi.mocked(scheduleOrDeliverPbdr)).not.toHaveBeenCalled();
  });
});

describe("resendPbdrEmail", () => {
  const project = {
    id: PROJECT_ID,
    client_id: "org-1",
    status: "delivered",
    project_number: "OPS-1",
    delivery_recipient_email: null,
    submitted_by: "sub-1",
  };
  const pbdrRows = [
    { project_id: PROJECT_ID, file_type: "pbdr", storage_path: "org-1/proj-1/pbdr/v1.pdf", version: 1 },
    { project_id: PROJECT_ID, file_type: "pbdr", storage_path: "org-1/proj-1/pbdr/v2.pdf", version: 2 },
  ];

  it("emails the submitter with the latest PBDR version and audit-logs the resend", async () => {
    const mock = buildMock({ project, pbdrRows });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "sub-1",
        type: "pbdr_delivery",
        emailSubject: "Your Performance Report — OPS-1-S",
        message: "Your PBDR for project OPS-1-S has been resent.",
      })
    );
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "pbdr.redelivered",
      ADMIN.id,
      ADMIN.email,
      expect.objectContaining({
        projectId: PROJECT_ID,
        metadata: expect.objectContaining({ pbdr_version: 2, triggered_by: "super_admin_resend" }),
      })
    );
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(`/admin/projects/${PROJECT_ID}?pbdr_resent=1`);
  });

  it("also emails delivery_recipient_email when set and different from the submitter", async () => {
    const mock = buildMock({
      project: { ...project, delivery_recipient_email: "recipient@example.com" },
      pbdrRows,
      submitterEmail: "submitter@example.com",
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@example.com",
        subject: "Your Performance Report — OPS-1-S",
        source: "conversion_resend_delivery_recipient",
      })
    );
  });

  it("skips the delivery_recipient email when it matches the submitter's address", async () => {
    const mock = buildMock({
      project: { ...project, delivery_recipient_email: "Submitter@Example.com" },
      pbdrRows,
      submitterEmail: "submitter@example.com",
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("returns an error when the project isn't found or not yet delivered", async () => {
    const mock = buildMock({ project: null, pbdrRows: [] });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "Project not found or not yet delivered." });
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it("returns an error when no PBDR file exists for the project", async () => {
    const mock = buildMock({ project, pbdrRows: [] });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "No PBDR file found for this project." });
  });

  it("returns an error when a signed download URL can't be generated", async () => {
    const mock = buildMock({ project, pbdrRows, signedUrl: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "Failed to generate download link." });
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it("lets an assigned consultant resend and redirects to the ops path", async () => {
    const CONSULTANT = { id: "consultant-1", email: "consultant@ddeg.com.au", role: "consultant" };
    vi.mocked(requireRole).mockResolvedValue(CONSULTANT as never);
    const mock = buildMock({
      project: { ...project, assigned_consultant_id: "consultant-1" },
      pbdrRows,
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "pbdr.redelivered",
      CONSULTANT.id,
      CONSULTANT.email,
      expect.objectContaining({
        metadata: expect.objectContaining({ triggered_by: "consultant_resend" }),
      })
    );
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(`/ops/projects/${PROJECT_ID}?pbdr_resent=1`);
  });

  it("denies a consultant who isn't assigned to the project", async () => {
    const CONSULTANT = { id: "consultant-1", email: "consultant@ddeg.com.au", role: "consultant" };
    vi.mocked(requireRole).mockResolvedValue(CONSULTANT as never);
    const mock = buildMock({
      project: { ...project, assigned_consultant_id: "someone-else" },
      pbdrRows,
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "Project not found or not yet delivered." });
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it("falls back to a short project id reference when project_number is unset", async () => {
    const mock = buildMock({ project: { ...project, project_number: null }, pbdrRows });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await resendPbdrEmail(PROJECT_ID, {}, new FormData());

    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({ emailSubject: `Your Performance Report — ${PROJECT_ID.slice(0, 8)}` })
    );
  });
});
