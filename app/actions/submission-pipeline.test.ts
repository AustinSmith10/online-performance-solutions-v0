import { describe, it, expect, vi, beforeEach } from "vitest";

// This file departs from submission-pipeline.ts's own stated "thin/untested
// orchestrator" convention (see the header comment there) deliberately: #149's
// auto-assignment behavior is exactly the kind of draft-creation logic a
// later authorization fix (#160) depends on being correct, so it gets direct
// coverage here rather than being left to "tested through the pure pieces it
// calls" — there is no pure piece that captures this rule on its own.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");

import { requestSingleUploadUrl } from "./submission-pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

function buildSupabaseMock() {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const createSignedUploadUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://signed", token: "tok" }, error: null });

  return {
    from: vi.fn(() => ({ upsert })),
    storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    upsert,
  };
}

const ITEM = { name: "file.pdf", size: 1000 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureDraftProject auto-assignment (#149)", () => {
  it("auto-assigns a consultant submitting on behalf of a client to the draft", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      id: "consultant-1",
      role: "consultant",
      client_id: null,
    } as never);
    const mock = buildSupabaseMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await requestSingleUploadUrl("proj-1", "tmpl-1", "org-1", null, "site-plan", ITEM);

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_consultant_id: "consultant-1" }),
      { onConflict: "id", ignoreDuplicates: true }
    );
  });

  it("does not auto-assign an admin submitting on behalf of a client", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      id: "admin-1",
      role: "admin",
      client_id: null,
    } as never);
    const mock = buildSupabaseMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await requestSingleUploadUrl("proj-1", "tmpl-1", "org-1", null, "site-plan", ITEM);

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_consultant_id: null }),
      { onConflict: "id", ignoreDuplicates: true }
    );
  });

  it("does not auto-assign a stakeholder's own self-submission", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      id: "stakeholder-1",
      role: "stakeholder",
      client_id: "org-1",
    } as never);
    const mock = buildSupabaseMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await requestSingleUploadUrl("proj-1", "tmpl-1", null, null, "site-plan", ITEM);

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_consultant_id: null, submitted_by: "stakeholder-1" }),
      { onConflict: "id", ignoreDuplicates: true }
    );
  });

  it("does not auto-assign a super_admin submitting on behalf of a client", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      id: "super-1",
      role: "super_admin",
      client_id: null,
    } as never);
    const mock = buildSupabaseMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await requestSingleUploadUrl("proj-1", "tmpl-1", "org-1", null, "site-plan", ITEM);

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_consultant_id: null }),
      { onConflict: "id", ignoreDuplicates: true }
    );
  });

  it("relies on the upsert's ignoreDuplicates option so a second call for an existing draft never overwrites assigned_consultant_id", async () => {
    // ensureDraftProject always issues the same upsert shape with
    // ignoreDuplicates: true — Postgres/PostgREST silently no-ops on the
    // conflicting row rather than updating it, so a second call for the same
    // draft id can never clobber an already-set assigned_consultant_id. This
    // test asserts the option is actually wired, since that's the entire
    // mechanism this guarantee depends on.
    vi.mocked(requireRole).mockResolvedValue({
      id: "consultant-1",
      role: "consultant",
      client_id: null,
    } as never);
    const mock = buildSupabaseMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await requestSingleUploadUrl("proj-1", "tmpl-1", "org-1", null, "site-plan", ITEM);
    await requestSingleUploadUrl("proj-1", "tmpl-1", "org-1", null, "site-plan", { ...ITEM, name: "file2.pdf" });

    for (const call of mock.upsert.mock.calls) {
      expect(call[1]).toEqual({ onConflict: "id", ignoreDuplicates: true });
    }
  });
});
