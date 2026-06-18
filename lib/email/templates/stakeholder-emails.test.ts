import { describe, it, expect } from "vitest";
import { renderApprovalRequestEmail } from "./ApprovalRequestEmail";
import { renderModificationsRequestedEmail } from "./ModificationsRequestedEmail";
import { renderRevisionNoticeEmail } from "./RevisionNoticeEmail";

// ─── renderApprovalRequestEmail ───────────────────────────────────────────────

describe("renderApprovalRequestEmail", () => {
  const base = {
    stakeholderName: "Jane Smith",
    projectId: "abc12345",
    approvalUrl: "https://ops.ddeg.com.au/approve/tok123",
    expiresAt: "30 June 2026",
  };

  it("includes the stakeholder name in the greeting", () => {
    const html = renderApprovalRequestEmail(base);
    expect(html).toContain("Jane Smith");
  });

  it("includes the project reference", () => {
    const html = renderApprovalRequestEmail(base);
    expect(html).toContain("abc12345");
  });

  it("includes the approval URL", () => {
    const html = renderApprovalRequestEmail(base);
    expect(html).toContain("https://ops.ddeg.com.au/approve/tok123");
  });

  it("includes the expiry date", () => {
    const html = renderApprovalRequestEmail(base);
    expect(html).toContain("30 June 2026");
  });

  it("uses 'Approval required' heading for a fresh dispatch", () => {
    const html = renderApprovalRequestEmail({ ...base, isFreshToken: false });
    expect(html).toContain("Approval required");
    expect(html).not.toContain("Reminder");
  });

  it("uses 'Reminder' heading when isFreshToken is true", () => {
    const html = renderApprovalRequestEmail({ ...base, isFreshToken: true });
    expect(html).toContain("Reminder");
  });

  it("includes a PBDB download link when pbdbUrl is provided", () => {
    const html = renderApprovalRequestEmail({
      ...base,
      pbdbUrl: "https://storage.example.com/file.docx",
    });
    expect(html).toContain("https://storage.example.com/file.docx");
    expect(html).toContain("Download PBDB");
  });

  it("omits the PBDB section when pbdbUrl is null", () => {
    const html = renderApprovalRequestEmail({ ...base, pbdbUrl: null });
    expect(html).not.toContain("Download PBDB");
  });

  it("HTML-escapes special characters in stakeholder name", () => {
    const html = renderApprovalRequestEmail({ ...base, stakeholderName: "O'Brien & Co <test>" });
    expect(html).not.toContain("<test>");
    expect(html).toContain("&lt;test&gt;");
    expect(html).toContain("&amp;");
  });
});

// ─── renderModificationsRequestedEmail ───────────────────────────────────────

describe("renderModificationsRequestedEmail", () => {
  const base = {
    consultantName: "Alex Lee",
    projectId: "OPS-001",
    projectUrl: "https://ops.ddeg.com.au/admin/projects/123",
  };

  it("shows '1 stakeholder has' for a single comment", () => {
    const html = renderModificationsRequestedEmail({
      ...base,
      modifications: [{ stakeholderName: "Jane", comments: "Fix page 3." }],
    });
    expect(html).toContain("1 stakeholder has");
  });

  it("shows 'N stakeholders have' for multiple comments", () => {
    const html = renderModificationsRequestedEmail({
      ...base,
      modifications: [
        { stakeholderName: "Jane", comments: "Fix page 3." },
        { stakeholderName: "Bob", comments: "Update the title." },
      ],
    });
    expect(html).toContain("2 stakeholders have");
  });

  it("includes all stakeholder names and comments", () => {
    const html = renderModificationsRequestedEmail({
      ...base,
      modifications: [
        { stakeholderName: "Jane Smith", comments: "Fix page 3." },
        { stakeholderName: "Bob Jones", comments: "Update the title." },
      ],
    });
    expect(html).toContain("Jane Smith");
    expect(html).toContain("Fix page 3.");
    expect(html).toContain("Bob Jones");
    expect(html).toContain("Update the title.");
  });

  it("includes the project URL as a CTA link", () => {
    const html = renderModificationsRequestedEmail({
      ...base,
      modifications: [{ stakeholderName: "Jane", comments: "Fix it." }],
    });
    expect(html).toContain("https://ops.ddeg.com.au/admin/projects/123");
  });

  it("includes the consultant name", () => {
    const html = renderModificationsRequestedEmail({
      ...base,
      modifications: [{ stakeholderName: "Jane", comments: "Fix it." }],
    });
    expect(html).toContain("Alex Lee");
  });

  it("HTML-escapes comments", () => {
    const html = renderModificationsRequestedEmail({
      ...base,
      modifications: [{ stakeholderName: "Jane", comments: "<script>alert(1)</script>" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ─── renderRevisionNoticeEmail ────────────────────────────────────────────────

describe("renderRevisionNoticeEmail", () => {
  it("includes the stakeholder name", () => {
    const html = renderRevisionNoticeEmail({ stakeholderName: "Jane Smith", projectId: "OPS-001" });
    expect(html).toContain("Jane Smith");
  });

  it("includes the project reference", () => {
    const html = renderRevisionNoticeEmail({ stakeholderName: "Jane", projectId: "OPS-001" });
    expect(html).toContain("OPS-001");
  });

  it("mentions that previous approval has been reset", () => {
    const html = renderRevisionNoticeEmail({ stakeholderName: "Jane", projectId: "OPS-001" });
    expect(html).toContain("previous approval has been reset");
  });

  it("tells the stakeholder a new approval request is incoming", () => {
    const html = renderRevisionNoticeEmail({ stakeholderName: "Jane", projectId: "OPS-001" });
    expect(html).toContain("new approval");
  });

  it("does not contain a tokenised approval link (informational only)", () => {
    const html = renderRevisionNoticeEmail({ stakeholderName: "Jane", projectId: "OPS-001" });
    expect(html).not.toContain("/approve/");
  });
});
