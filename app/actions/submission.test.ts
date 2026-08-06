import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/delivery/public-holidays", () => ({
  getPublicHolidays: vi.fn().mockResolvedValue(new Set()),
}));

let afterPromise: Promise<unknown> | undefined;
vi.mock("next/server", () => ({
  after: vi.fn((fn: () => Promise<unknown>) => {
    afterPromise = fn();
  }),
}));

import { submitProject } from "./submission";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";

const PROJECT_ID = "proj-1";
const CLIENT_ID = "org-1";
const ACTOR_ID = "actor-1";

function makeSubmitFormData(overrides: Record<string, string> = {}): FormData {
  const fields = {
    project_id: PROJECT_ID,
    template_id: "template-1",
    reviewed_confirmed: "true",
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self; obj.eq = self; obj.is = self; obj.in = self; obj.neq = self;
  obj.order = self; obj.limit = self; obj.not = self;
  obj.single = resolve; obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  obj.catch = () => obj;
  return obj;
}

function buildMock(opts: { flaggedFiles?: unknown[] } = {}) {
  const draftBefore = { extracted_fields: {}, po_number: null };
  const clientRow = { name: "Acme", delivery_working_days: 5, state_territory: "NSW" };

  const updateResultChain: Record<string, unknown> = {};
  updateResultChain.eq = vi.fn().mockReturnValue(updateResultChain);
  updateResultChain.then = (fn: (v: unknown) => unknown) =>
    Promise.resolve({ error: null, count: 1 }).then(fn);
  const updateFn = vi.fn().mockReturnValue(updateResultChain);

  const projectFilesUpdateFn = vi.fn().mockReturnValue(chain(null));

  const calls: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    calls[table] = (calls[table] ?? 0) + 1;
    const n = calls[table];

    if (table === "template_field_mappings") return chain([]);
    if (table === "clients") return chain(clientRow);
    if (table === "projects") {
      if (n === 1) return chain(draftBefore); // pre-submit draft snapshot
      return { update: updateFn }; // the submit update
    }
    if (table === "users") return chain([]);
    if (table === "project_files") {
      if (opts.flaggedFiles !== undefined && n === 1) {
        return chain(opts.flaggedFiles);
      }
      return { ...chain(null), update: projectFilesUpdateFn };
    }
    return chain(null);
  });

  return { from, projectFilesUpdateFn };
}

beforeEach(() => {
  vi.clearAllMocks();
  afterPromise = undefined;
  vi.mocked(requireRole).mockResolvedValue({
    id: ACTOR_ID,
    role: "stakeholder",
    email: "client@example.com",
    client_id: CLIENT_ID,
  } as never);
  vi.mocked(auditLog).mockResolvedValue(undefined as never);
  vi.mocked(notify).mockResolvedValue(undefined as never);
});

describe("submitProject — reviewed acknowledgement gate", () => {
  it("blocks submission when the reviewed confirmation is missing", async () => {
    const result = await submitProject({}, makeSubmitFormData({ reviewed_confirmed: "false" }));
    expect(result.error).toMatch(/confirm.*reviewed/i);
  });

  it("blocks submission when the reviewed confirmation is absent entirely", async () => {
    const fd = new FormData();
    fd.append("project_id", PROJECT_ID);
    fd.append("template_id", "template-1");
    const result = await submitProject({}, fd);
    expect(result.error).toMatch(/confirm.*reviewed/i);
  });

  it("allows submission when the reviewed confirmation is present, and logs it as its own audit event", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock() as never);

    await submitProject({}, makeSubmitFormData());
    await afterPromise;

    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "project.review_confirmed",
      ACTOR_ID,
      "client@example.com",
      expect.objectContaining({ orgId: CLIENT_ID, projectId: PROJECT_ID })
    );
  });
});

describe("submitProject — verification mismatch gate (#113)", () => {
  it("blocks submission when a flagged file hasn't been confirmed", async () => {
    const mock = buildMock({ flaggedFiles: [{ id: "file-1", verification_mismatch_reasons: ["mismatch"] }] });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await submitProject({}, makeSubmitFormData());

    expect(result.error).toMatch(/confirm the flagged file/i);
    expect(mock.projectFilesUpdateFn).not.toHaveBeenCalled();
  });

  it("allows submission once the flagged file was already confirmed (#115: confirmation happens inline during upload, not at submit)", async () => {
    const mock = buildMock({
      flaggedFiles: [
        { id: "file-1", verification_mismatch_reasons: ["mismatch"], verification_confirmed_at: "2024-01-01T00:00:00Z" },
      ],
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await submitProject({}, makeSubmitFormData());
    await afterPromise;

    // No re-stamping needed — confirmFileVerification already persisted this
    // during the per-file pipeline, well before Continue was even enabled.
    expect(mock.projectFilesUpdateFn).not.toHaveBeenCalled();
    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "project.review_confirmed",
      ACTOR_ID,
      "client@example.com",
      expect.objectContaining({ orgId: CLIENT_ID, projectId: PROJECT_ID })
    );
  });

  it("does not require any confirmation when no files are flagged", async () => {
    const mock = buildMock({ flaggedFiles: [] });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await submitProject({}, makeSubmitFormData());
    await afterPromise;

    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "project.review_confirmed",
      ACTOR_ID,
      "client@example.com",
      expect.objectContaining({ orgId: CLIENT_ID, projectId: PROJECT_ID })
    );
  });
});
