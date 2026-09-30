import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock("@/lib/email/execute-resolution", () => ({ executeQueueRowResolution: mockExecute }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email/sender");

import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sender";
import {
  approveQueueEntry,
  reassignQueueEntry,
  rejectQueueEntry,
  requestClarification,
  getSuggestedReviewsForSender,
  getTaggedReviewForEntry,
  searchProjectsForReassign,
  getReviewCyclesForProject,
} from "./email-queue";

const ACTOR = { id: "actor-1", email: "admin@example.com", role: "admin" };

function makeQueryBuilder(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

const CANDIDATE_ROWS = [
  {
    id: "review-1",
    review_cycle: 2,
    stakeholder_name: "Rattan",
    project_id: "proj-9",
    projects: { id: "proj-9", project_number: null, site_address: "42 Example St" },
  },
];

const PENDING_ENTRY = {
  id: "queue-1",
  status: "pending",
  from_email: "client@example.com",
  from_name: null,
  subject: "Subject",
  message_id: "msg-1",
  mailbox_hash: null,
  text_body: "body",
  stripped_reply_text: null,
  received_at: "2026-07-22T09:00:00Z",
  attachment_paths: [],
  proposed_category: "thread_reply",
  proposed_project_id: "proj-1",
  proposed_stakeholder_review_id: null,
};

describe("email-queue actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(ACTOR as never);
    vi.mocked(sendEmail).mockResolvedValue(true);
  });

  describe("approveQueueEntry", () => {
    it("returns an error when the entry doesn't exist", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("missing");
      expect(result.error).toBeTruthy();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("returns an error when the entry is already resolved", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...PENDING_ENTRY, status: "approved" }, error: null }) })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("queue-1");
      expect(result.error).toBeTruthy();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("is still resolvable when a clarification is pending (awaiting_clarification isn't final)", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-1" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: { ...PENDING_ENTRY, status: "awaiting_clarification" }, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("queue-1");
      expect(result.error).toBeUndefined();
      expect(mockExecute).toHaveBeenCalled();
    });

    it("returns an error when the entry has no proposed target", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: { ...PENDING_ENTRY, proposed_project_id: null }, error: null }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("queue-1");
      expect(result.error).toBeTruthy();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("runs execution against the proposed target and marks the row approved", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-1" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("queue-1");

      expect(result.error).toBeUndefined();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ id: "queue-1" }),
        { category: "thread_reply", projectId: "proj-1" },
        expect.anything()
      );
      expect(eq).toHaveBeenCalledWith("id", "queue-1");
      expect(vi.mocked(auditLog)).toHaveBeenCalledWith("email_queue.approved", "actor-1", "admin@example.com", expect.anything());
    });

    it("leaves the row unresolved and surfaces the error when execution fails", async () => {
      mockExecute.mockResolvedValue({ ok: false, error: "boom" });
      const updateFn = vi.fn();

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }),
            update: updateFn,
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("queue-1");

      expect(result.error).toBe("boom");
      expect(updateFn).not.toHaveBeenCalled();
    });

    it("redirects to the new project's Documents tab when it landed with unconfirmed document types", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-new" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });
      const newSubmissionEntry = { ...PENDING_ENTRY, proposed_category: "new_submission", proposed_project_id: null };

      const fromMock = vi.fn((table: string) => {
        if (table === "inbound_email_queue") {
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: newSubmissionEntry, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          });
        }
        if (table === "project_files") {
          // eq() is called twice (project_id, then file_type_confirmed) and
          // mockReturnThis, so `count` sits on the builder itself — awaiting
          // the chain resolves to the same object.
          return makeQueryBuilder({ count: 1 });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);
      vi.mocked(requireRole).mockResolvedValue({ id: "actor-1", email: "admin@example.com", role: "consultant" } as never);

      const result = await approveQueueEntry("queue-1");

      expect(result.error).toBeUndefined();
      expect(result.redirectTo).toBe("/ops/projects/proj-new?queue_approved=1");
    });

    it("does not redirect when the new project has no unconfirmed documents", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-new" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });
      const newSubmissionEntry = { ...PENDING_ENTRY, proposed_category: "new_submission", proposed_project_id: null };

      const fromMock = vi.fn((table: string) => {
        if (table === "inbound_email_queue") {
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: newSubmissionEntry, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          });
        }
        if (table === "project_files") return makeQueryBuilder({ count: 0 });
        throw new Error(`unexpected table: ${table}`);
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("queue-1");

      expect(result.error).toBeUndefined();
      expect(result.redirectTo).toBeUndefined();
    });

    it("does not redirect for a thread_reply approval, even with unconfirmed documents on the target project", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-1" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });

      const fromMock = vi.fn((table: string) => {
        if (table === "inbound_email_queue") {
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);

      const result = await approveQueueEntry("queue-1");

      expect(result.error).toBeUndefined();
      expect(result.redirectTo).toBeUndefined();
      // project_files must never even be queried for a thread_reply — the "table"
      // is not stubbed above, so calling it would throw and fail this test.
    });
  });

  describe("reassignQueueEntry", () => {
    it("requires a project for thread_reply", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }) })),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await reassignQueueEntry("queue-1", "thread_reply", null, null);
      expect(result.error).toBeTruthy();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("requires both a project and a review cycle for stakeholder_response", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }) })),
      } as unknown as ReturnType<typeof createAdminClient>);

      const missingReview = await reassignQueueEntry("queue-1", "stakeholder_response", "proj-1", null);
      expect(missingReview.error).toBeTruthy();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("needs no target for new_submission", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-new" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await reassignQueueEntry("queue-1", "new_submission", null, null);

      expect(result.error).toBeUndefined();
      expect(mockExecute).toHaveBeenCalledWith(expect.anything(), { category: "new_submission" }, expect.anything());
    });

    it("runs execution against the newly chosen stakeholder_response target", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-2" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await reassignQueueEntry("queue-1", "stakeholder_response", "proj-2", "review-9");

      expect(result.error).toBeUndefined();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.anything(),
        { category: "stakeholder_response", stakeholderReviewId: "review-9" },
        expect.anything()
      );
    });

    it("redirects to the new project's Documents tab when reassigning to new_submission lands unconfirmed documents", async () => {
      mockExecute.mockResolvedValue({ ok: true, projectId: "proj-new" });
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });

      const fromMock = vi.fn((table: string) => {
        if (table === "inbound_email_queue") {
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_ENTRY, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          });
        }
        if (table === "project_files") return makeQueryBuilder({ count: 2 });
        throw new Error(`unexpected table: ${table}`);
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);

      const result = await reassignQueueEntry("queue-1", "new_submission", null, null);

      expect(result.error).toBeUndefined();
      expect(result.redirectTo).toBe("/admin/projects/proj-new?queue_approved=1");
    });
  });

  describe("rejectQueueEntry", () => {
    it("marks the row rejected with the given reason and performs no execution", async () => {
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "queue-1", status: "pending" }, error: null }),
            update: vi.fn().mockReturnValue({ eq }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await rejectQueueEntry("queue-1", "not relevant");

      expect(result.error).toBeUndefined();
      expect(mockExecute).not.toHaveBeenCalled();
      expect(eq).toHaveBeenCalledWith("id", "queue-1");
    });

    it("returns an error when the entry is already resolved", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "queue-1", status: "rejected" }, error: null }) })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await rejectQueueEntry("queue-1", null);
      expect(result.error).toBeTruthy();
    });
  });

  describe("requestClarification", () => {
    it("returns an error when the entry doesn't exist", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeQueryBuilder()),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await requestClarification("missing", "Which project is this?");
      expect(result.error).toBeTruthy();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("returns an error when the message is blank", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeQueryBuilder()),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await requestClarification("queue-1", "   ");
      expect(result.error).toBeTruthy();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("returns an error when the entry is already resolved", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "queue-1", status: "approved", from_email: "rattan@ops.test" }, error: null }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await requestClarification("queue-1", "Which project is this?");
      expect(result.error).toBeTruthy();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("sends the admin's free-text message and marks the row awaiting_clarification", async () => {
      const eq = vi.fn().mockResolvedValue({ data: null, error: null });
      const update = vi.fn().mockReturnValue({ eq });

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "queue-1", status: "pending", from_email: "rattan@ops.test" }, error: null }),
            limit: vi.fn().mockResolvedValue({ data: CANDIDATE_ROWS, error: null }),
            update,
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const result = await requestClarification("queue-1", "  Which of your reviews is this about?  ");

      expect(result.error).toBeUndefined();
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "rattan@ops.test",
          html: expect.stringContaining("Which of your reviews is this about?"),
          source: "email_queue_clarification_request",
        })
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "awaiting_clarification",
          clarification_requested_by: "actor-1",
          clarification_message: "Which of your reviews is this about?",
          clarification_candidates: expect.arrayContaining([expect.objectContaining({ projectLabel: "42 Example St" })]),
        })
      );
      expect(eq).toHaveBeenCalledWith("id", "queue-1");
      expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
        "email_queue.clarification_requested",
        "actor-1",
        "admin@example.com",
        expect.objectContaining({ metadata: expect.objectContaining({ candidate_count: 1 }) })
      );
    });
  });

  describe("getSuggestedReviewsForSender", () => {
    it("returns candidate reviews shaped for display", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: { from_email: "rattan@ops.test" }, error: null }),
            limit: vi.fn().mockResolvedValue({ data: CANDIDATE_ROWS, error: null }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const results = await getSuggestedReviewsForSender("queue-1");
      expect(results).toEqual([
        { reviewId: "review-1", projectId: "proj-9", projectLabel: "42 Example St", reviewLabel: "Cycle 2 — Rattan" },
      ]);
    });

    it("returns an empty list when the entry doesn't exist", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeQueryBuilder()),
      } as unknown as ReturnType<typeof createAdminClient>);

      const results = await getSuggestedReviewsForSender("missing");
      expect(results).toEqual([]);
    });
  });

  describe("getTaggedReviewForEntry", () => {
    const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
    const PAST = new Date(Date.now() - 86_400_000).toISOString();
    const reviewRow = (over: Record<string, unknown> = {}) => ({
      id: "review-7",
      review_cycle: 3,
      stakeholder_name: "Rattan",
      project_id: "proj-9",
      status: "pending",
      expires_at: FUTURE,
      projects: { id: "proj-9", project_number: "221083", site_address: "42 Example St" },
      ...over,
    });

    function clientFor(entry: unknown, review: unknown) {
      const from = vi.fn((table: string) =>
        makeQueryBuilder({
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === "inbound_email_queue" ? entry : review,
            error: null,
          }),
        })
      );
      vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
      return from;
    }

    it("returns null, without looking up reviews, when the email has no mailbox hash", async () => {
      const from = clientFor({ mailbox_hash: null }, reviewRow());
      expect(await getTaggedReviewForEntry("queue-1")).toBeNull();
      expect(from).not.toHaveBeenCalledWith("stakeholder_reviews");
    });

    it("returns null when the entry doesn't exist or the hash matches no review", async () => {
      clientFor(null, null);
      expect(await getTaggedReviewForEntry("missing")).toBeNull();
      clientFor({ mailbox_hash: "unknown-token" }, null);
      expect(await getTaggedReviewForEntry("queue-1")).toBeNull();
    });

    it("names the review even when its link has expired", async () => {
      clientFor({ mailbox_hash: "tok" }, reviewRow({ expires_at: PAST }));
      expect(await getTaggedReviewForEntry("queue-1")).toEqual({
        reviewId: "review-7",
        projectId: "proj-9",
        projectLabel: "221083",
        reviewLabel: "Cycle 3 — Rattan",
        note: "link expired",
      });
    });

    it("flags a review that was already responded to, ahead of expiry", async () => {
      clientFor({ mailbox_hash: "tok" }, reviewRow({ status: "approved_with_comments", expires_at: PAST }));
      expect((await getTaggedReviewForEntry("queue-1"))?.note).toBe("already responded");
    });

    it("has no note for a live pending review", async () => {
      clientFor({ mailbox_hash: "tok" }, reviewRow());
      expect((await getTaggedReviewForEntry("queue-1"))?.note).toBeNull();
    });
  });

  describe("pickers", () => {
    it("searchProjectsForReassign builds a readable label from project fields", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeQueryBuilder({
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ id: "proj-1", project_number: "PN-1", po_number: null, site_address: "12 Example St", clients: { name: "Acme" } }],
              error: null,
            }),
          })
        ),
      } as unknown as ReturnType<typeof createAdminClient>);

      const results = await searchProjectsForReassign("");
      expect(results).toEqual([{ id: "proj-1", label: "PN-1 · 12 Example St · Acme" }]);
    });

    it("getReviewCyclesForProject returns an empty list for an empty projectId", async () => {
      const results = await getReviewCyclesForProject("");
      expect(results).toEqual([]);
    });
  });
});
