import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockNotify } = vi.hoisted(() => ({ mockNotify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications/notify", () => ({ notify: mockNotify }));

import { notifyProjectStaff } from "./notify-staff";

function client(project: unknown, admins: { id: string }[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "projects") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }) };
      }
      return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: admins, error: null }) };
    }),
  } as never;
}

const PROJECT = {
  id: "proj-12345678",
  project_number: "221083",
  extracted_fields: null,
  assigned_consultant_id: "consultant-1",
  qa_completed_by: null,
};

describe("notifyProjectStaff", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends one in-app-only notification to the consultant and each admin, once each", async () => {
    await notifyProjectStaff(client(PROJECT, [{ id: "admin-1" }, { id: "consultant-1" }]), "proj-12345678", {
      type: "email_queue_reply_received",
      message: (ref) => `Reply on ${ref}`,
    });

    const recipients = mockNotify.mock.calls.map((c) => c[0].recipientId).sort();
    expect(recipients).toEqual(["admin-1", "consultant-1"]);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({
      type: "email_queue_reply_received",
      message: "Reply on 221083",
      projectId: "proj-12345678",
      inAppOnly: true,
    });
  });

  it("prefers the QA owner over the assigned consultant, and the site address over the number", async () => {
    await notifyProjectStaff(
      client({ ...PROJECT, qa_completed_by: "qa-1", extracted_fields: { EXTRACT_ADDRESS: "42 Example St" } }, []),
      "proj-12345678",
      { type: "email_queue_reply_received", message: (ref) => ref }
    );
    expect(mockNotify).toHaveBeenCalledOnce();
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ recipientId: "qa-1", message: "42 Example St" });
  });

  it("does nothing when the project no longer exists", async () => {
    await notifyProjectStaff(client(null, [{ id: "admin-1" }]), "gone", { type: "email_queue_reply_received", message: () => "x" });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("does not let one failed notification stop the others", async () => {
    mockNotify.mockRejectedValueOnce(new Error("db down"));
    await expect(
      notifyProjectStaff(client(PROJECT, [{ id: "admin-1" }]), "proj-12345678", { type: "email_queue_reply_received", message: () => "x" })
    ).resolves.toBeUndefined();
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });
});
