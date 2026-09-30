import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/email/sender", () => ({ sendEmail: mockSendEmail }));

import { resolveSentCopyRecipients, sendSentCopies } from "./sent-copy";

type Row = Record<string, unknown>;
function fakeSupabase(opts: { project?: Row | null; users: Row[]; download?: () => Promise<{ data: Blob | null; error: { message: string } | null }> }) {
  return {
    from(table: string) {
      let rows: Row[] = table === "users" ? [...opts.users] : [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q);
      q.in = (k: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[k]))), q);
      q.maybeSingle = async () => ({ data: table === "projects" ? (opts.project ?? null) : (rows[0] ?? null) });
      q.then = (res: (v: { data: Row[] }) => void) => res({ data: rows });
      return q;
    },
    storage: {
      from: () => ({
        download: opts.download ?? (async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
      }),
    },
  } as never;
}

const USERS = [
  { id: "c1", email: "consultant@x.com", role: "consultant" },
  { id: "a1", email: "admin@x.com", role: "admin" },
  { id: "s1", email: "stake@x.com", role: "stakeholder" },
];

beforeEach(() => mockSendEmail.mockClear());

describe("resolveSentCopyRecipients", () => {
  it("is the assigned consultant alone when nobody triggered it (auto release)", async () => {
    const sb = fakeSupabase({ project: { assigned_consultant_id: "c1" }, users: USERS });
    expect((await resolveSentCopyRecipients(sb, "p", null)).map((r) => r.id)).toEqual(["c1"]);
  });
  it("adds the admin when an admin triggered the send", async () => {
    const sb = fakeSupabase({ project: { assigned_consultant_id: "c1" }, users: USERS });
    expect((await resolveSentCopyRecipients(sb, "p", "a1")).map((r) => r.id).sort()).toEqual(["a1", "c1"]);
  });
  it("does not add a non-admin actor, and does not duplicate the consultant acting themselves", async () => {
    const sb = fakeSupabase({ project: { assigned_consultant_id: "c1" }, users: USERS });
    expect((await resolveSentCopyRecipients(sb, "p", "c1")).map((r) => r.id)).toEqual(["c1"]);
    expect((await resolveSentCopyRecipients(sb, "p", "s1")).map((r) => r.id)).toEqual(["c1"]);
  });
});

describe("sendSentCopies", () => {
  const base = { projectId: "p", kind: "pbdb" as const, storagePath: "x.pdf", filename: "Rev0.pdf", projectRef: "1234" };

  it("sends one [Copy] per recipient with the PDF attached and no reply-to, regardless of stakeholder count", async () => {
    const sb = fakeSupabase({ project: { assigned_consultant_id: "c1" }, users: USERS });
    await sendSentCopies({ ...base, supabase: sb, actorId: "a1", stakeholderCount: 25 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    for (const [arg] of mockSendEmail.mock.calls) {
      expect(arg.subject).toMatch(/^\[Copy\] PBDB/);
      expect(arg.replyTo).toBeUndefined();
      expect(arg.source).toBe("sent_copy_pbdb");
      expect(arg.attachments).toHaveLength(1);
      expect(arg.attachments[0]).toMatchObject({ name: "Rev0.pdf", contentType: "application/pdf" });
      expect(arg.attachments[0].content).toEqual(Buffer.from([1, 2, 3]));
    }
  });

  it("uses a distinct source for PBDR", async () => {
    const sb = fakeSupabase({ project: { assigned_consultant_id: "c1" }, users: USERS });
    await sendSentCopies({ ...base, kind: "pbdr", supabase: sb, actorId: null });
    expect(mockSendEmail.mock.calls[0][0].source).toBe("sent_copy_pbdr");
  });

  it("never throws when the stored PDF cannot be read", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const sb = fakeSupabase({
      project: { assigned_consultant_id: "c1" },
      users: USERS,
      download: async () => ({ data: null, error: { message: "gone" } }),
    });
    await expect(sendSentCopies({ ...base, supabase: sb, actorId: null })).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
