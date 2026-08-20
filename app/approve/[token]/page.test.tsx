import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StakeholderReview } from "@/types";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound() called");
  },
}));
vi.mock("@/lib/stakeholders/tokens");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");

// Stub out the client components so we don't need a router/action-state
// context in this node test environment; we only care about whether the
// download link renders and with what filename.
vi.mock("./_components/ApprovalForm", () => ({
  ApprovalForm: () => null,
}));
vi.mock("./_components/RequestNewLinkForm", () => ({
  RequestNewLinkForm: () => null,
}));
vi.mock("./_components/ApproveDownloadLink", () => ({
  ApproveDownloadLink: ({ filename }: { href: string; filename?: string | null }) => (
    <div data-testid="download-link">{filename ?? "download"}</div>
  ),
}));

import ApprovePage from "./page";
import { validateToken } from "@/lib/stakeholders/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";

const validateTokenMock = vi.mocked(validateToken);
const createAdminClientMock = vi.mocked(createAdminClient);
const auditLogMock = vi.mocked(auditLog);

const REVIEW: StakeholderReview = {
  id: "review-1",
  project_id: "proj-1",
  review_cycle: 2,
  stakeholder_email: "jane@example.com",
  stakeholder_name: "Jane Smith",
  token: "tok-123",
  dispatched_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  fresh_token_sent_at: null,
  status: "pending",
  comments: null,
  responded_at: null,
  waived_by: null,
  waive_reason: null,
  waived_at: null,
  created_at: new Date().toISOString(),
  email_reply_text: null,
  email_reply_received_at: null,
  email_reply_sender_verified: null,
};

interface FileRow {
  file_type: string;
  review_cycle: number;
  storage_path: string;
  original_filename: string;
}

function projectFilesQuery(rows: FileRow[]) {
  const filters: Record<string, unknown> = {};
  const obj = {
    select: () => obj,
    eq: (col: string, val: unknown) => {
      // Every row in these tests already belongs to the one project under
      // test, so only the columns actually present on FileRow are used to
      // narrow the match — this mirrors what the real query filters on
      // without requiring every fixture to repeat project_id.
      filters[col] = val;
      return obj;
    },
    order: () => obj,
    limit: () => obj,
    maybeSingle: () =>
      Promise.resolve({
        data:
          rows.find((row) =>
            (["file_type", "review_cycle"] as const).every(
              (key) => filters[key] === undefined || row[key] === filters[key]
            )
          ) ?? null,
        error: null,
      }),
  };
  return obj;
}

function usersQuery() {
  const obj = {
    select: () => obj,
    eq: () => obj,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return obj;
}

function mockSupabase(fileRows: FileRow[]) {
  createAdminClientMock.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "project_files") return projectFilesQuery(fileRows);
      if (table === "users") return usersQuery();
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>);
}

async function renderApprovePage(token = "tok-123") {
  const element = await ApprovePage({ params: Promise.resolve({ token }) });
  return renderToStaticMarkup(element);
}

describe("ApprovePage download button visibility", () => {
  it("does not render the download button when only an older cycle's pbdb docx exists", async () => {
    validateTokenMock.mockResolvedValue({ review: REVIEW, isExpired: false });
    auditLogMock.mockResolvedValue(undefined);

    // Only a legacy "pbdb" docx exists, and only for cycle 1 — the review
    // under test is cycle 2, and there is no "pbdb_pdf" row at all.
    mockSupabase([
      {
        file_type: "pbdb",
        review_cycle: 1,
        storage_path: "path/cycle1.docx",
        original_filename: "cycle1.docx",
      },
    ]);

    const html = await renderApprovePage();

    expect(html).not.toContain('data-testid="download-link"');
  });

  it("renders the download button when a pbdb_pdf exists for the review's own cycle", async () => {
    validateTokenMock.mockResolvedValue({ review: REVIEW, isExpired: false });
    auditLogMock.mockResolvedValue(undefined);

    // Normal dispatch flow: PDF generated eagerly at dispatch time for this
    // review's cycle (2).
    mockSupabase([
      {
        file_type: "pbdb_pdf",
        review_cycle: 2,
        storage_path: "path/cycle2.pdf",
        original_filename: "cycle2.pdf",
      },
    ]);

    const html = await renderApprovePage();

    expect(html).toContain('data-testid="download-link"');
    expect(html).toContain("cycle2.pdf");
  });
});
