// Issue #163: the authorization deny-matrix test — the only thing that keeps
// the CRITICAL cross-tenant IDOR fix (#160) from silently regressing.
//
// Seeds two orgs (org_a, org_b), a submitter and a same-org non-submitter/
// non-reviewer stakeholder in org_a, a reviewer stakeholder on org_a's
// active project, a consultant assigned to org_a's active project only, and
// an unassigned consultant. Every one of the 10 actions #160 wired
// requireProjectAccess into is exercised against org_a's draft and active
// projects as every "wrong" actor its own role gate allows — every case
// must be denied. A couple of "right" actor cases are included too, so the
// matrix can't pass by being sufficiently maximalist elsewhere in this
// error path — see the "does not over-deny" block at the bottom.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/documents/extractor");
vi.mock("@/lib/documents/formatters");
vi.mock("@/lib/documents/field-flags");
vi.mock("@/lib/documents/compare-candidates");
vi.mock("@/lib/documents/metrics-autofill");
vi.mock("@/lib/documents/submission-shared");
vi.mock("@/lib/documents/draft-assembly");
vi.mock("@/lib/storage/sanitize-filename", () => ({ sanitizeFilename: (n: string) => n }));

import { resolveFieldFlag, acknowledgeFieldFlag, reExtractProject } from "@/app/actions/field-flags";
import { finalizeSubmission } from "@/app/actions/submission";
import {
  confirmFileVerification,
  retryFileExtraction,
  removeUploadedFile,
} from "@/app/actions/submission-pipeline";
import {
  uploadProjectFile,
  replaceProjectFile,
  updateStakeholderSubmission,
} from "@/app/actions/projects";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrgId, loadFileRequirements } from "@/lib/documents/submission-shared";

// ─── Seed data ──────────────────────────────────────────────────────────────

const ORG_A = "org-a";
const ORG_B = "org-b";

const STAKEHOLDER_A = { id: "stakeholder-a", role: "stakeholder", client_id: ORG_A, email: "a@org-a.test" };
const STAKEHOLDER_A2 = { id: "stakeholder-a2", role: "stakeholder", client_id: ORG_A, email: "a2@org-a.test" }; // same org, not submitter/reviewer
const REVIEWER_A = { id: "reviewer-a", role: "stakeholder", client_id: ORG_A, email: "reviewer@org-a.test" }; // reviewer, not submitter
const STAKEHOLDER_B = { id: "stakeholder-b", role: "stakeholder", client_id: ORG_B, email: "b@org-b.test" }; // different org entirely
const CONSULTANT_ASSIGNED = { id: "consultant-1", role: "consultant" };
const CONSULTANT_UNASSIGNED = { id: "consultant-2", role: "consultant" };

const PROJECT_DRAFT_ID = "proj-a-draft";
const PROJECT_ACTIVE_ID = "proj-a-active";

function projectRow(phase: "draft" | "active") {
  if (phase === "draft") {
    return {
      id: PROJECT_DRAFT_ID,
      client_id: ORG_A,
      submitted_by: STAKEHOLDER_A.id,
      assigned_consultant_id: null, // unassigned draft
      status: "draft",
      template_id: "tmpl-1",
      extracted_fields: {},
    };
  }
  return {
    id: PROJECT_ACTIVE_ID,
    client_id: ORG_A,
    submitted_by: STAKEHOLDER_A.id,
    assigned_consultant_id: CONSULTANT_ASSIGNED.id,
    status: "submitted",
    template_id: "tmpl-1",
    extracted_fields: {},
  };
}

// A generic in-memory Supabase mock: enough chain surface for every action's
// early access-check path (and a little past it, for the "does not
// over-deny" cases). Not a full Supabase reimplementation — deliberately
// only as much as these specific call paths need before the access check
// short-circuits them.
function genericEmptyChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["select", "eq", "is", "in", "order", "limit", "update", "insert", "delete"]) {
    chain[method] = self;
  }
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(fn);
  return chain;
}

function buildDb({
  phase,
  flagRow,
  fileRow,
  isReviewer,
  permissive = false,
}: {
  phase: "draft" | "active";
  flagRow?: Record<string, unknown>;
  fileRow?: Record<string, unknown>;
  isReviewer?: boolean;
  // The deny-path tests deliberately throw on any table beyond what the
  // access check itself needs, so a denial test can't pass by accident (the
  // access check failing to short-circuit, but some downstream call also
  // happening to error out). The "does not over-deny" tests exercise code
  // *past* a successful access check, so they need a permissive fallback
  // instead — otherwise they'd fail on unrelated downstream tables that have
  // nothing to do with the thing being asserted.
  permissive?: boolean;
}) {
  const project = projectRow(phase);
  const projectId = project.id;

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.is = self;
      chain.update = self;
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: project, error: null });
      chain.single = vi.fn().mockResolvedValue({ data: project, error: null });
      chain.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(fn);
      return chain;
    }
    if (table === "stakeholder_reviews") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: isReviewer ? { id: "review-1" } : null, error: null }),
      };
    }
    if (table === "field_flags") {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.update = self;
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: flagRow ?? null, error: null });
      return chain;
    }
    if (table === "project_files") {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.in = self;
      chain.update = self;
      chain.delete = self;
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: fileRow ?? null, error: null });
      chain.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(fn);
      return chain;
    }
    if (table === "file_requirements") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(fn),
      };
    }
    if (permissive) return genericEmptyChain();

    // Any other table reached means the access check did NOT short-circuit
    // as expected — fail loudly rather than silently returning empty data,
    // which could mask a denial test passing for the wrong reason.
    throw new Error(`authorization-deny-matrix: unexpected table "${table}" for project ${projectId}`);
  });

  return { from, storage: { from: vi.fn() } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOrgId).mockImplementation((actor: { client_id?: unknown }, actsOnBehalf: boolean) =>
    actsOnBehalf ? ORG_A : ((actor.client_id as string) ?? "")
  );
  vi.mocked(loadFileRequirements).mockResolvedValue([]);
});

const DENIED_ERROR_SUBSTRINGS = ["not found", "access denied", "denied"];

function expectDenied(result: { error?: string; ok?: boolean } | undefined) {
  expect(result).toBeDefined();
  if ("ok" in (result as object)) {
    expect((result as { ok: boolean }).ok).toBe(false);
  }
  const message = (result?.error ?? "").toLowerCase();
  expect(DENIED_ERROR_SUBSTRINGS.some((s) => message.includes(s))).toBe(true);
}

// ─── Deny matrix ────────────────────────────────────────────────────────────

type WrongActor =
  | typeof STAKEHOLDER_A2
  | typeof STAKEHOLDER_B
  | typeof CONSULTANT_UNASSIGNED;

const STAKEHOLDER_WRONG_ACTORS: WrongActor[] = [STAKEHOLDER_A2, STAKEHOLDER_B];
const ALL_WRONG_ACTORS: WrongActor[] = [STAKEHOLDER_A2, STAKEHOLDER_B, CONSULTANT_UNASSIGNED];
const PHASES: Array<"draft" | "active"> = ["draft", "active"];

describe("authorization deny-matrix (#163) — field-flags actions", () => {
  const cases = PHASES.flatMap((phase) => ALL_WRONG_ACTORS.map((actor) => ({ phase, actor })));

  it.each(cases)("resolveFieldFlag denies $actor.role $actor.id on $phase project", async ({ phase, actor }) => {
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    const db = buildDb({
      phase,
      flagRow: { id: "flag-1", project_id: projectRow(phase).id, field_key: "EXTRACT_PO", status: "open" },
    });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await resolveFieldFlag("flag-1", { value: "x", reason: "self_resolved" });
    expectDenied(result);
  });

  it.each(cases)("acknowledgeFieldFlag denies $actor.role $actor.id on $phase project", async ({ phase, actor }) => {
    // acknowledgeFieldFlag is consultant/admin-only — skip stakeholder wrong actors here.
    if (actor.role === "stakeholder") return;
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    const db = buildDb({
      phase,
      flagRow: { id: "flag-1", project_id: projectRow(phase).id },
    });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await acknowledgeFieldFlag("flag-1");
    expectDenied(result);
  });

  it.each(cases)("reExtractProject denies $actor.role $actor.id on $phase project", async ({ phase, actor }) => {
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    const db = buildDb({ phase });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await reExtractProject(projectRow(phase).id);
    expectDenied(result);
  });
});

describe("authorization deny-matrix (#163) — submission actions", () => {
  const cases = PHASES.flatMap((phase) => ALL_WRONG_ACTORS.map((actor) => ({ phase, actor })));

  it.each(cases)("finalizeSubmission denies $actor.role $actor.id on $phase project", async ({ phase, actor }) => {
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    const db = buildDb({ phase });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const adminOrgId = actor.role === "consultant" ? ORG_A : null;
    const adminClientId = actor.role === "consultant" ? STAKEHOLDER_A.id : null;
    const result = await finalizeSubmission(projectRow(phase).id, "tmpl-1", adminOrgId, adminClientId);
    expectDenied(result);
  });

  it.each(cases)(
    "confirmFileVerification denies $actor.role $actor.id on $phase project",
    async ({ phase, actor }) => {
      vi.mocked(requireRole).mockResolvedValue(actor as never);
      const db = buildDb({
        phase,
        fileRow: { id: "file-1", project_id: projectRow(phase).id, storage_path: "x", original_filename: "x.pdf" },
      });
      vi.mocked(createAdminClient).mockReturnValue(db as never);

      const result = await confirmFileVerification("file-1");
      expectDenied(result);
    }
  );

  it.each(cases)(
    "retryFileExtraction denies $actor.role $actor.id on $phase project",
    async ({ phase, actor }) => {
      vi.mocked(requireRole).mockResolvedValue(actor as never);
      const db = buildDb({
        phase,
        fileRow: { id: "file-1", project_id: projectRow(phase).id, storage_path: "x", original_filename: "x.pdf" },
      });
      vi.mocked(createAdminClient).mockReturnValue(db as never);

      const result = await retryFileExtraction("file-1");
      expectDenied(result);
    }
  );

  it.each(cases)(
    "removeUploadedFile denies $actor.role $actor.id on $phase project",
    async ({ phase, actor }) => {
      vi.mocked(requireRole).mockResolvedValue(actor as never);
      const db = buildDb({
        phase,
        fileRow: { id: "file-1", project_id: projectRow(phase).id, storage_path: "x" },
      });
      vi.mocked(createAdminClient).mockReturnValue(db as never);

      const result = await removeUploadedFile("file-1");
      expectDenied(result);
    }
  );

  it.each(cases)("uploadProjectFile denies $actor.role $actor.id on $phase project", async ({ phase, actor }) => {
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    const db = buildDb({ phase });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const formData = new FormData();
    formData.set("file", new File(["x"], "x.pdf"));
    const result = await uploadProjectFile(projectRow(phase).id, {}, formData);
    expectDenied(result);
  });
});

describe("authorization deny-matrix (#163) — same-org stakeholder IDOR (#14), stakeholder-only actions", () => {
  const cases = PHASES.flatMap((phase) => STAKEHOLDER_WRONG_ACTORS.map((actor) => ({ phase, actor })));

  it.each(cases)("replaceProjectFile denies $actor.id on $phase project", async ({ phase, actor }) => {
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    const db = buildDb({ phase });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const formData = new FormData();
    formData.set("file", new File(["x"], "x.pdf"));
    const result = await replaceProjectFile(projectRow(phase).id, "file-1", {}, formData);
    expectDenied(result);
  });

  it.each(cases)("updateStakeholderSubmission denies $actor.id on $phase project", async ({ phase, actor }) => {
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    const db = buildDb({ phase });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const formData = new FormData();
    formData.set("EXTRACT_ADDRESS", "1 New St");
    const result = await updateStakeholderSubmission(projectRow(phase).id, {}, formData);
    expectDenied(result);
  });
});

// A same-org non-reviewer/non-submitter stakeholder or an unassigned
// consultant are ALSO denied for reasons independent of the org check
// itself (they simply aren't the submitter or a reviewer) — so a matrix
// built only from those actors can't catch a regression that specifically
// breaks the org (client_id) comparison while leaving the submitter/
// reviewer checks intact. This isolates that one check: a stakeholder whose
// org doesn't match, but who — hypothetically, this shouldn't occur in real
// data — *is* recorded as a reviewer on the project. Only the org check
// stands between this actor and access.
describe("authorization deny-matrix (#163) — isolates the org (client_id) check specifically", () => {
  it("resolveFieldFlag denies a cross-org stakeholder even if they somehow have a reviewer row on this project", async () => {
    vi.mocked(requireRole).mockResolvedValue(STAKEHOLDER_B as never);
    const db = buildDb({
      phase: "active",
      flagRow: { id: "flag-1", project_id: PROJECT_ACTIVE_ID, field_key: "EXTRACT_PO", status: "open" },
      isReviewer: true,
    });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await resolveFieldFlag("flag-1", { value: "x", reason: "self_resolved" });
    expectDenied(result);
  });

  it("finalizeSubmission denies a cross-org stakeholder even if they somehow have a reviewer row on this project", async () => {
    vi.mocked(requireRole).mockResolvedValue(STAKEHOLDER_B as never);
    const db = buildDb({ phase: "active", isReviewer: true });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await finalizeSubmission(PROJECT_ACTIVE_ID, "tmpl-1", null, null);
    expectDenied(result);
  });
});

// ─── Does not over-deny: the legitimate-access side of the same rules ──────

describe("authorization deny-matrix (#160) — on-behalf-of draft flow still works end-to-end", () => {
  it("the consultant who auto-assigned themselves to an on-behalf-of draft (#149) can act on it via requireProjectAccess", async () => {
    // This is the exact scenario #160 was blocked on until #149 shipped: a
    // consultant-submitted draft has no assigned_consultant_id UNLESS #149's
    // auto-assignment set it at creation. Confirms that once it is set, the
    // consultant branch (uniform across both phases) grants access to their
    // own on-behalf-of draft, not just to already-active projects.
    vi.mocked(requireRole).mockResolvedValue(CONSULTANT_ASSIGNED as never);
    const onBehalfOfDraft = {
      ...projectRow("draft"),
      assigned_consultant_id: CONSULTANT_ASSIGNED.id, // set by #149 at draft creation
    };
    const from = vi.fn((table: string) => {
      if (table === "projects") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.is = self;
        chain.update = self;
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: onBehalfOfDraft, error: null });
        chain.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(fn);
        return chain;
      }
      if (table === "project_files") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.update = self;
        chain.delete = self;
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { id: "file-1", project_id: onBehalfOfDraft.id, storage_path: "x" },
          error: null,
        });
        return chain;
      }
      return genericEmptyChain();
    });
    vi.mocked(createAdminClient).mockReturnValue({
      from,
      storage: { from: vi.fn().mockReturnValue({ remove: vi.fn().mockResolvedValue({ data: null, error: null }) }) },
    } as never);

    const result = await removeUploadedFile("file-1");
    expect(JSON.stringify(result)).not.toMatch(/file not found/i);
  });
});

describe("authorization deny-matrix (#163) — does not over-deny legitimate access", () => {
  it("the submitter is not denied by reExtractProject's tenancy check on their own draft", async () => {
    vi.mocked(requireRole).mockResolvedValue(STAKEHOLDER_A as never);
    const db = buildDb({ phase: "draft", permissive: true });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await reExtractProject(PROJECT_DRAFT_ID);
    // Denied for a *different* reason (no extractable documents attached in
    // this minimal mock) is fine — the point is it's NOT the tenancy error.
    expect(JSON.stringify(result)).not.toMatch(/project not found/i);
  });

  it("a reviewer stakeholder is allowed through the tenancy check on the active project they're reviewing", async () => {
    vi.mocked(requireRole).mockResolvedValue(REVIEWER_A as never);
    const db = buildDb({
      phase: "active",
      flagRow: { id: "flag-1", project_id: PROJECT_ACTIVE_ID, field_key: "EXTRACT_PO", status: "open" },
      isReviewer: true,
      permissive: true,
    });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await resolveFieldFlag("flag-1", { value: "x", reason: "self_resolved" });
    // A value error further down the pipeline is fine; must not be the
    // "flag not found" (tenancy-denial) message.
    expect(JSON.stringify(result)).not.toMatch(/flag not found/i);
  });

  it("the assigned consultant is not denied by confirmFileVerification's tenancy check on their project", async () => {
    vi.mocked(requireRole).mockResolvedValue(CONSULTANT_ASSIGNED as never);
    const db = buildDb({
      phase: "active",
      fileRow: {
        id: "file-1",
        project_id: PROJECT_ACTIVE_ID,
        storage_path: "x",
        original_filename: "x.pdf",
        extraction_status: "completed",
      },
      permissive: true,
    });
    vi.mocked(createAdminClient).mockReturnValue(db as never);

    const result = await confirmFileVerification("file-1");
    expect(JSON.stringify(result)).not.toMatch(/file not found/i);
  });
});
