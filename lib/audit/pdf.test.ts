import { describe, it, expect, vi } from "vitest";

const convertHtmlToPdf = vi.fn(async (html: string) => Buffer.from(html, "utf-8"));
vi.mock("@/lib/documents/pdf", () => ({ convertHtmlToPdf: (html: string) => convertHtmlToPdf(html) }));

import { auditEntriesToPdf } from "./pdf";
import type { AuditRow } from "./query";

function row(overrides: Partial<AuditRow>): AuditRow {
  return {
    id: "id-1",
    event_type: "auth.login",
    actor_id: "user-1",
    actor_email: "user@example.com",
    project_id: null,
    client_id: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00.000Z",
    project: null,
    org: null,
    ...overrides,
  };
}

describe("auditEntriesToPdf", () => {
  it("renders human-readable labels and category names instead of raw codes", async () => {
    await auditEntriesToPdf([row({ event_type: "auth.login" })], "Audit trail");
    const html = convertHtmlToPdf.mock.calls.at(-1)![0] as string;

    expect(html).toContain("User logged in");
    expect(html).toContain("Authentication");
    expect(html).not.toContain(">auth.login<");
  });

  it("escapes HTML-significant characters from metadata-derived details", async () => {
    await auditEntriesToPdf(
      [row({ event_type: "stakeholder.waived", metadata: { reason: "<script>alert(1)</script>" } })],
      "Audit trail"
    );
    const html = convertHtmlToPdf.mock.calls.at(-1)![0] as string;

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes the given title and total entry count", async () => {
    await auditEntriesToPdf([row({ id: "1" }), row({ id: "2" })], "Audit trail — project proj-1");
    const html = convertHtmlToPdf.mock.calls.at(-1)![0] as string;

    expect(html).toContain("Audit trail — project proj-1");
    expect(html).toContain("2 entries");
  });
});
