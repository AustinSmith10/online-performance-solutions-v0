import { describe, it, expect } from "vitest";
import { AcknowledgementEmail } from "./AcknowledgementEmail";
import { renderAvailableRequestsDigestEmail } from "./AvailableRequestsDigestEmail";
import { ConsultantAssignedEmail } from "./ConsultantAssignedEmail";
import { renderCreditDeductionEmail } from "./CreditDeductionEmail";
import { renderLowCreditEmail } from "./LowCreditEmail";
import { renderPbdrDeliveryEmail } from "./PBDRDeliveryEmail";
import { QaCompleteEmail } from "./QaCompleteEmail";
import { renderReviewResponseConfirmationEmail } from "./ReviewResponseConfirmationEmail";
import { renderStakeholderBufferUpdateEmail } from "./StakeholderBufferUpdateEmail";
import { WelcomeAccountEmail } from "./WelcomeAccountEmail";

// ─── AcknowledgementEmail ─────────────────────────────────────────────────────

describe("AcknowledgementEmail", () => {
  const base = {
    recipientName: "Jane Smith",
    projectId: "OPS-001",
    expectedDeliveryDate: "12 June 2026",
    portalUrl: "https://ops.ddeg.com.au/portal",
  };

  it("includes the recipient name, project reference, and delivery date", () => {
    const html = AcknowledgementEmail(base);
    expect(html).toContain("Jane Smith");
    expect(html).toContain("OPS-001");
    expect(html).toContain("12 June 2026");
  });

  it("includes the portal URL as a link", () => {
    const html = AcknowledgementEmail(base);
    expect(html).toContain("https://ops.ddeg.com.au/portal");
  });

  it("HTML-escapes the recipient name", () => {
    const html = AcknowledgementEmail({ ...base, recipientName: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ─── AvailableRequestsDigestEmail ─────────────────────────────────────────────

describe("renderAvailableRequestsDigestEmail", () => {
  it("uses singular wording for a single available request", () => {
    const html = renderAvailableRequestsDigestEmail({ count: 1, portalUrl: "https://ops.ddeg.com.au/ops" });
    expect(html).toContain("1 available request");
    expect(html).not.toContain("1 available requests");
  });

  it("uses plural wording for multiple available requests", () => {
    const html = renderAvailableRequestsDigestEmail({ count: 4, portalUrl: "https://ops.ddeg.com.au/ops" });
    expect(html).toContain("4 available requests");
  });

  it("includes the portal URL", () => {
    const html = renderAvailableRequestsDigestEmail({ count: 2, portalUrl: "https://ops.ddeg.com.au/ops" });
    expect(html).toContain("https://ops.ddeg.com.au/ops");
  });
});

// ─── ConsultantAssignedEmail ───────────────────────────────────────────────────

describe("ConsultantAssignedEmail", () => {
  const base = {
    recipientName: "Alex Lee",
    projectRef: "123 Example St",
    orgName: "Acme Builders",
    portalUrl: "https://ops.ddeg.com.au/ops",
  };

  it("includes the consultant name, project reference, and org name", () => {
    const html = ConsultantAssignedEmail(base);
    expect(html).toContain("Alex Lee");
    expect(html).toContain("123 Example St");
    expect(html).toContain("Acme Builders");
  });

  it("HTML-escapes the org name", () => {
    const html = ConsultantAssignedEmail({ ...base, orgName: "A & B <Co>" });
    expect(html).not.toContain("<Co>");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;Co&gt;");
  });
});

// ─── CreditDeductionEmail ──────────────────────────────────────────────────────

describe("renderCreditDeductionEmail", () => {
  const base = {
    orgName: "Acme Builders",
    projectRef: "OPS-001",
    creditsDeducted: 1,
    newBalance: 4,
    portalUrl: "https://ops.ddeg.com.au/portal",
  };

  it("uses singular wording for a single credit", () => {
    const html = renderCreditDeductionEmail(base);
    expect(html).toContain("1 credit has been deducted");
  });

  it("uses plural wording for multiple credits", () => {
    const html = renderCreditDeductionEmail({ ...base, creditsDeducted: 2 });
    expect(html).toContain("2 credits have been deducted");
  });

  it("includes the org name and project reference", () => {
    const html = renderCreditDeductionEmail(base);
    expect(html).toContain("Acme Builders");
    expect(html).toContain("OPS-001");
  });

  it("shows the remaining balance, pluralised", () => {
    expect(renderCreditDeductionEmail(base)).toContain("4 credits");
    expect(renderCreditDeductionEmail({ ...base, newBalance: 1 })).toContain("1 credit");
  });

  it("includes the portal URL", () => {
    expect(renderCreditDeductionEmail(base)).toContain("https://ops.ddeg.com.au/portal");
  });

  it("HTML-escapes the org name", () => {
    const html = renderCreditDeductionEmail({ ...base, orgName: "<script>x</script>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ─── LowCreditEmail ─────────────────────────────────────────────────────────────

describe("renderLowCreditEmail", () => {
  const base = {
    orgName: "Acme Builders",
    currentBalance: 1,
    portalUrl: "https://ops.ddeg.com.au/portal",
  };

  it("includes the org name and current balance", () => {
    const html = renderLowCreditEmail(base);
    expect(html).toContain("Acme Builders");
    expect(html).toContain("1 credit");
  });

  it("pluralises the balance correctly", () => {
    expect(renderLowCreditEmail({ ...base, currentBalance: 2 })).toContain("2 credits");
  });

  it("includes the support contact address", () => {
    expect(renderLowCreditEmail(base)).toMatch(/mailto:/);
  });

  it("includes the portal URL", () => {
    expect(renderLowCreditEmail(base)).toContain("https://ops.ddeg.com.au/portal");
  });

  it("HTML-escapes the org name", () => {
    const html = renderLowCreditEmail({ ...base, orgName: "A & B <Co>" });
    expect(html).not.toContain("<Co>");
    expect(html).toContain("&amp;");
  });
});

// ─── PBDRDeliveryEmail (string + JSX variants) ─────────────────────────────────

describe("renderPbdrDeliveryEmail (string variant)", () => {
  const base = {
    recipientName: "Jane Smith",
    projectId: "OPS-001",
    downloadUrl: "https://storage.example.com/report.pdf",
    expiresAt: "19 June 2026",
  };

  it("includes the recipient, project id, download link, and expiry", () => {
    const html = renderPbdrDeliveryEmail(base);
    expect(html).toContain("Jane Smith");
    expect(html).toContain("OPS-001");
    expect(html).toContain("https://storage.example.com/report.pdf");
    expect(html).toContain("19 June 2026");
  });

  it("HTML-escapes the recipient name", () => {
    const html = renderPbdrDeliveryEmail({ ...base, recipientName: "<b>Jane</b>" });
    expect(html).not.toContain("<b>Jane</b>");
    expect(html).toContain("&lt;b&gt;Jane&lt;/b&gt;");
  });
});


// ─── QaCompleteEmail ────────────────────────────────────────────────────────────

describe("QaCompleteEmail", () => {
  it("includes the project reference and portal link", () => {
    const html = QaCompleteEmail({ projectRef: "OPS-001", portalUrl: "https://ops.ddeg.com.au/admin/projects/1" });
    expect(html).toContain("OPS-001");
    expect(html).toContain("https://ops.ddeg.com.au/admin/projects/1");
  });

  it("mentions dispatching to stakeholders", () => {
    const html = QaCompleteEmail({ projectRef: "OPS-001", portalUrl: "https://ops.ddeg.com.au" });
    expect(html).toContain("dispatching to stakeholders");
  });
});

// ─── ReviewResponseConfirmationEmail ───────────────────────────────────────────

describe("renderReviewResponseConfirmationEmail", () => {
  const base = {
    recipientName: "Jane Smith",
    projectRef: "OPS-001",
    portalUrl: "https://ops.ddeg.com.au/portal",
  };

  it("shows an 'Approved' badge and approval copy for an approved response", () => {
    const html = renderReviewResponseConfirmationEmail({
      ...base,
      response: "approved",
      comments: null,
    });
    expect(html).toContain("Approved");
    expect(html).toContain("Thank you for your approval");
  });

  it("shows a 'Changes requested' badge and follow-up copy for a rejected response", () => {
    const html = renderReviewResponseConfirmationEmail({
      ...base,
      response: "rejected",
      comments: "Please fix page 3.",
    });
    expect(html).toContain("Changes requested");
    expect(html).toContain("Our team has been notified");
  });

  it("includes comments when provided", () => {
    const html = renderReviewResponseConfirmationEmail({
      ...base,
      response: "rejected",
      comments: "Please fix page 3.",
    });
    expect(html).toContain("Please fix page 3.");
  });

  it("omits the comments block when comments is null", () => {
    const html = renderReviewResponseConfirmationEmail({
      ...base,
      response: "approved",
      comments: null,
    });
    expect(html).not.toContain('font-style:italic');
  });

  it("HTML-escapes comments", () => {
    const html = renderReviewResponseConfirmationEmail({
      ...base,
      response: "rejected",
      comments: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ─── StakeholderBufferUpdateEmail ──────────────────────────────────────────────

describe("renderStakeholderBufferUpdateEmail", () => {
  const base = {
    stakeholderName: "Jane Smith",
    projectId: "OPS-001",
    totalStakeholders: 3,
  };

  it("reports the response count out of total stakeholders", () => {
    const html = renderStakeholderBufferUpdateEmail({ ...base, respondedCount: 1 });
    expect(html).toContain("1 of 3 stakeholders have responded");
  });

  it("uses singular wording when there is only one stakeholder", () => {
    const html = renderStakeholderBufferUpdateEmail({ ...base, totalStakeholders: 1, respondedCount: 0 });
    expect(html).toContain("0 of 1 stakeholder have responded");
  });

  it("shows a call-to-action link when the recipient still needs to respond", () => {
    const html = renderStakeholderBufferUpdateEmail({
      ...base,
      respondedCount: 1,
      approvalUrl: "https://ops.ddeg.com.au/approve?token=abc",
      expiresAt: "30 June 2026",
    });
    expect(html).toContain("https://ops.ddeg.com.au/approve?token=abc");
    expect(html).toContain("Submit your response");
  });

  it("shows 'no further action' copy when approvalUrl is not provided", () => {
    const html = renderStakeholderBufferUpdateEmail({ ...base, respondedCount: 3 });
    expect(html).toContain("No further action is required");
    expect(html).not.toContain("Submit your response");
  });
});

// ─── WelcomeAccountEmail ────────────────────────────────────────────────────────

describe("WelcomeAccountEmail", () => {
  const base = {
    firstName: "Jane",
    email: "jane@example.com",
    role: "consultant",
    resetLink: "https://ops.ddeg.com.au/reset?token=abc",
    appUrl: "https://ops.ddeg.com.au",
  };

  it("includes the first name, email, and reset link", () => {
    const html = WelcomeAccountEmail(base);
    expect(html).toContain("Jane");
    expect(html).toContain("jane@example.com");
    expect(html).toContain("https://ops.ddeg.com.au/reset?token=abc");
  });

  it("maps known role values to their display label", () => {
    const html = WelcomeAccountEmail({ ...base, role: "super_admin" });
    expect(html).toContain("Super Admin");
  });

  it("falls back to the raw role string for an unknown role", () => {
    const html = WelcomeAccountEmail({ ...base, role: "mystery_role" });
    expect(html).toContain("mystery_role");
  });

  it("HTML-escapes the first name", () => {
    const html = WelcomeAccountEmail({ ...base, firstName: "<script>x</script>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
