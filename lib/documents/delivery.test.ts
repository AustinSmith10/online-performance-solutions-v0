import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/payments/gate");
vi.mock("@/lib/documents/converter");
vi.mock("@/lib/documents/color-strip");
vi.mock("@/lib/documents/pdf");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/email/sender");
vi.mock("@/lib/email/templates/PBDRDeliveryEmail");

import { deliverPbdr } from "./delivery";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPbdrGate } from "@/lib/payments/gate";
import { convertPbdbToPbdr } from "@/lib/documents/converter";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/sender";

const PROJECT_ID = "proj-1";
const CLIENT_ID = "org-1";
const ADMIN_ID = "admin-1";

/** A minimal chainable query builder that actually filters an in-memory row set,
 * so tests exercise the real .eq("review_cycle", …) scoping rather than just
 * asserting mock call args. */
function queryable(rows: Record<string, unknown>[], insertFn?: (row: unknown) => Promise<{ data: null; error: null }>) {
  let filtered = [...rows];
  let orderCol: string | null = null;
  let ascending = true;
  const builder = {
    select: () => builder,
    insert: insertFn ?? (async () => ({ data: null, error: null })),
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
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
    single: async () => ({ data: filtered[0] ?? null, error: null }),
    then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: filtered, error: null }).then(fn),
  };
  return builder;
}

function buildMock(pbdbRows: Record<string, unknown>[], reviewCycle: number) {
  const project = {
    id: PROJECT_ID,
    client_id: CLIENT_ID,
    status: "dispatched",
    project_number: "OPS-1",
    extracted_fields: { EXTRACT_ADDRESS: "123 Test St" },
    delivery_recipient_email: null,
    submitted_by: "sub-1",
    assigned_consultant_id: null,
    review_cycle: reviewCycle,
    strip_token_color: false,
  };

  const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const uploadFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const downloadFn = vi.fn().mockResolvedValue({
    data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    error: null,
  });
  const createSignedUrlFn = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
          }),
        }),
      };
    }
    if (table === "project_files") return queryable(pbdbRows, insertFn);
    if (table === "users") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sub-1", email: "sub@x.com" }, error: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: ADMIN_ID }], error: null }).then(fn),
      };
    }
    return queryable([]);
  });

  return { from, insertFn, uploadFn, storage: { from: vi.fn().mockReturnValue({ download: downloadFn, upload: uploadFn, createSignedUrl: createSignedUrlFn, remove: vi.fn().mockResolvedValue({ data: null, error: null }) }) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkPbdrGate).mockResolvedValue({ allowed: true, creditDeducted: true });
  vi.mocked(convertPbdbToPbdr).mockImplementation((buf: Buffer) => buf);
  vi.mocked(convertDocxToPdf).mockResolvedValue(Buffer.from("pdf-bytes"));
  vi.mocked(notify).mockResolvedValue(undefined);
  vi.mocked(sendEmail).mockResolvedValue(true);
});

describe("deliverPbdr — scopes the PBDB lookup to the final-approved review cycle", () => {
  it("converts the cycle-2 docx, not a stale cycle-1 version left in storage", async () => {
    const pbdbRows = [
      { project_id: PROJECT_ID, file_type: "pbdb", storage_path: "org-1/proj-1/pbdb/v1_R0.docx", version: 1, review_cycle: 1 },
      { project_id: PROJECT_ID, file_type: "pbdb", storage_path: "org-1/proj-1/pbdb/v2_R0_qa.docx", version: 2, review_cycle: 1 },
      { project_id: PROJECT_ID, file_type: "pbdb", storage_path: "org-1/proj-1/pbdb/v3_R1.docx", version: 3, review_cycle: 2 },
    ];
    const mock = buildMock(pbdbRows, 2);
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await deliverPbdr(PROJECT_ID, ADMIN_ID, "admin@ddeg.com.au");

    expect(result.success).toBe(true);
    expect(vi.mocked(convertPbdbToPbdr)).toHaveBeenCalledTimes(1);
    // Confirm the PBDR insert records the correct source version (v3, cycle 2).
    expect(mock.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: "pbdr" })
    );
  });

  it("fails cleanly when no PBDB exists for the current review cycle", async () => {
    const pbdbRows = [{ project_id: PROJECT_ID, file_type: "pbdb", storage_path: "org-1/proj-1/pbdb/v1_R0.docx", version: 1, review_cycle: 1 }];
    const mock = buildMock(pbdbRows, 2); // project is on cycle 2, but only a cycle-1 docx exists
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await deliverPbdr(PROJECT_ID, ADMIN_ID, "admin@ddeg.com.au");

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/QA'd PBDB not found/);
  });
});
