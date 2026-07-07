import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/stakeholders/dispatch");

import { uploadQaPbdb } from "./projects";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { dispatchPbdb } from "@/lib/stakeholders/dispatch";

const PROJECT_ID = "proj-1";
const CLIENT_ID = "org-1";
const ACTOR_ID = "actor-1";

function makeFileFormData(): FormData {
  const fd = new FormData();
  fd.append("file", new File(["docx bytes"], "revised.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
  return fd;
}

/**
 * Builds a supabase mock for one call to uploadQaPbdb.
 * `status` / `reviewCycle` describe the project state at the start of the call;
 * `existingVersion` seeds the highest existing pbdb version so far.
 */
function buildMock({
  status,
  reviewCycle,
  existingVersion,
}: {
  status: string;
  reviewCycle: number;
  existingVersion: number;
}) {
  const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const uploadFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const projectUpdateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });

  const project = {
    id: PROJECT_ID,
    client_id: CLIENT_ID,
    status,
    review_cycle: reviewCycle,
    project_number: "OPS-1",
    extracted_fields: { EXTRACT_ADDRESS: "123 Test St" },
  };

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }),
        update: projectUpdateFn,
      };
    }
    if (table === "project_files") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [{ version: existingVersion }], error: null }),
        insert: insertFn,
      };
    }
    if (table === "users") {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(fn) };
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
  });

  return { from, insertFn, uploadFn, storage: { from: vi.fn().mockReturnValue({ upload: uploadFn }) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: ACTOR_ID, role: "consultant", email: "c@ddeg.com.au" } as never);
  vi.mocked(dispatchPbdb).mockResolvedValue(undefined);
});

describe("uploadQaPbdb — review_cycle tagging across a multi-round rejection scenario", () => {
  it("tags the initial QA upload with the current (pre-dispatch) review_cycle", async () => {
    const mock = buildMock({ status: "in_progress", reviewCycle: 1, existingVersion: 1 });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await uploadQaPbdb(PROJECT_ID, {}, makeFileFormData());

    expect(mock.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ review_cycle: 1, version: 2 })
    );
  });

  it("round 1: reupload after the first rejection tags the docx with review_cycle 2", async () => {
    const mock = buildMock({ status: "revision_required", reviewCycle: 1, existingVersion: 2 });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await uploadQaPbdb(PROJECT_ID, {}, makeFileFormData());

    expect(mock.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ review_cycle: 2, version: 3 })
    );
  });

  it("round 2: reupload after a second rejection tags the docx with review_cycle 3", async () => {
    const mock = buildMock({ status: "revision_required", reviewCycle: 2, existingVersion: 3 });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await uploadQaPbdb(PROJECT_ID, {}, makeFileFormData());

    expect(mock.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ review_cycle: 3, version: 4 })
    );
  });

  it("a dispatched-cycle resend (no rejection) still tags the docx with the next cycle", async () => {
    const mock = buildMock({ status: "dispatched", reviewCycle: 1, existingVersion: 1 });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await uploadQaPbdb(PROJECT_ID, {}, makeFileFormData());

    expect(mock.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ review_cycle: 2, version: 2 })
    );
  });
});
