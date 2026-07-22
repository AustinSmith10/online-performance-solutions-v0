/**
 * Renders every email template to HTML and writes them to /tmp/email-previews/,
 * plus an index.html contact sheet linking them all.
 *
 * Run with: npx tsx scripts/preview-emails.tsx
 * Then: open /tmp/email-previews/index.html
 */
import * as fs from "fs";
import * as path from "path";

import { AcknowledgementEmail } from "../lib/email/templates/AcknowledgementEmail";
import { renderApprovalRequestEmail } from "../lib/email/templates/ApprovalRequestEmail";
import { renderAvailableRequestsDigestEmail } from "../lib/email/templates/AvailableRequestsDigestEmail";
import { ConsultantAssignedEmail } from "../lib/email/templates/ConsultantAssignedEmail";
import { renderCreditDeductionEmail } from "../lib/email/templates/CreditDeductionEmail";
import { renderLowCreditEmail } from "../lib/email/templates/LowCreditEmail";
import { renderModificationsRequestedEmail } from "../lib/email/templates/ModificationsRequestedEmail";
import { renderPbdrDeliveryEmail } from "../lib/email/templates/PBDRDeliveryEmail";
import { QaCompleteEmail } from "../lib/email/templates/QaCompleteEmail";
import { renderReviewResponseConfirmationEmail } from "../lib/email/templates/ReviewResponseConfirmationEmail";
import { renderRevisionNoticeEmail } from "../lib/email/templates/RevisionNoticeEmail";
import { renderStakeholderBufferUpdateEmail } from "../lib/email/templates/StakeholderBufferUpdateEmail";
import { WelcomeAccountEmail } from "../lib/email/templates/WelcomeAccountEmail";

const APP = "http://localhost:3000";

const templates: { name: string; html: string }[] = [
  {
    name: "AcknowledgementEmail",
    html: AcknowledgementEmail({
      recipientName: "Jane Smith",
      projectId: "OPS-2026-118",
      expectedDeliveryDate: "12 June 2026",
      portalUrl: `${APP}/portal`,
    }),
  },
  {
    name: "ApprovalRequestEmail",
    html: renderApprovalRequestEmail({
      stakeholderName: "Bob Johnson",
      projectId: "OPS-2026-118",
      approvalUrl: `${APP}/approve?token=abc123`,
      expiresAt: "30 June 2026",
      pbdbUrl: `${APP}/files/pbdb.docx`,
    }),
  },
  {
    name: "ApprovalRequestEmail-reminder",
    html: renderApprovalRequestEmail({
      stakeholderName: "Bob Johnson",
      projectId: "OPS-2026-118",
      approvalUrl: `${APP}/approve?token=abc123`,
      expiresAt: "30 June 2026",
      isFreshToken: true,
    }),
  },
  {
    name: "AvailableRequestsDigestEmail",
    html: renderAvailableRequestsDigestEmail({
      count: 3,
      portalUrl: `${APP}/ops`,
      queueCount: 5,
      queueUrl: `${APP}/email-queue`,
    }),
  },
  {
    name: "ConsultantAssignedEmail",
    html: ConsultantAssignedEmail({
      recipientName: "Alex Lee",
      projectRef: "14 Marine Parade",
      orgName: "Acme Builders",
      portalUrl: `${APP}/ops`,
    }),
  },
  {
    name: "CreditDeductionEmail",
    html: renderCreditDeductionEmail({
      orgName: "Acme Builders",
      projectRef: "14 Marine Parade",
      creditsDeducted: 1,
      newBalance: 4,
      portalUrl: `${APP}/portal`,
    }),
  },
  {
    name: "LowCreditEmail",
    html: renderLowCreditEmail({
      orgName: "Acme Builders",
      currentBalance: 1,
      portalUrl: `${APP}/portal`,
    }),
  },
  {
    name: "ModificationsRequestedEmail",
    html: renderModificationsRequestedEmail({
      consultantName: "Alex Lee",
      projectId: "OPS-2026-118",
      modifications: [
        {
          stakeholderName: "Jane Smith",
          comments: "Please update the energy star rating on page 3 — it should be 4.5, not 4.0.",
        },
        { stakeholderName: "Bob Johnson", comments: "Title block needs the revised lot number." },
      ],
      projectUrl: `${APP}/admin/projects/OPS-2026-118`,
    }),
  },
  {
    name: "PBDRDeliveryEmail",
    html: renderPbdrDeliveryEmail({
      recipientName: "Jane Smith",
      projectId: "OPS-2026-118",
      downloadUrl: `${APP}/download?token=xyz789`,
      expiresAt: "19 June 2026",
    }),
  },
  {
    name: "QaCompleteEmail",
    html: QaCompleteEmail({
      projectRef: "14 Marine Parade",
      portalUrl: `${APP}/admin/projects/OPS-2026-118`,
    }),
  },
  {
    name: "ReviewResponseConfirmationEmail-approved",
    html: renderReviewResponseConfirmationEmail({
      recipientName: "Jane Smith",
      projectRef: "14 Marine Parade",
      response: "approved",
      comments: null,
      portalUrl: `${APP}/portal`,
    }),
  },
  {
    name: "ReviewResponseConfirmationEmail-rejected",
    html: renderReviewResponseConfirmationEmail({
      recipientName: "Jane Smith",
      projectRef: "14 Marine Parade",
      response: "rejected",
      comments: "The glazing schedule doesn't match the drawings.",
      portalUrl: `${APP}/portal`,
    }),
  },
  {
    name: "RevisionNoticeEmail",
    html: renderRevisionNoticeEmail({
      stakeholderName: "Bob Johnson",
      projectId: "OPS-2026-118",
      note: "Updated following the glazing schedule correction.",
    }),
  },
  {
    name: "StakeholderBufferUpdateEmail-pending",
    html: renderStakeholderBufferUpdateEmail({
      stakeholderName: "Bob Johnson",
      projectId: "OPS-2026-118",
      totalStakeholders: 3,
      respondedCount: 1,
      approvalUrl: `${APP}/approve?token=abc123`,
      expiresAt: "30 June 2026",
    }),
  },
  {
    name: "StakeholderBufferUpdateEmail-done",
    html: renderStakeholderBufferUpdateEmail({
      stakeholderName: "Bob Johnson",
      projectId: "OPS-2026-118",
      totalStakeholders: 3,
      respondedCount: 3,
    }),
  },
  {
    name: "WelcomeAccountEmail",
    html: WelcomeAccountEmail({
      firstName: "Jane",
      email: "jane@acmebuilders.com.au",
      role: "consultant",
      resetLink: `${APP}/reset?token=abc123`,
      appUrl: APP,
    }),
  },
];

const outDir = "/tmp/email-previews";
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const { name, html } of templates) {
  const doc = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>${name}</title></head>\n<body style="margin:0">\n${html}\n</body>\n</html>`;
  fs.writeFileSync(path.join(outDir, `${name}.html`), doc);
  console.log(`wrote ${name}.html`);
}

const cards = templates
  .map(
    ({ name }) =>
      `<a href="${name}.html" style="display:block;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;text-decoration:none;background:#fff">
        <div style="padding:10px 14px;border-bottom:1px solid #e4e4e7;font:600 13px system-ui;color:#18181b">${name}</div>
        <iframe src="${name}.html" style="width:100%;height:420px;border:0;display:block" title="${name}"></iframe>
      </a>`
  )
  .join("\n");

fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OPS email templates</title></head>
<body style="margin:0;background:#fafafa;font-family:system-ui,sans-serif">
  <div style="max-width:1400px;margin:0 auto;padding:40px 24px">
    <h1 style="font:700 28px Georgia,serif;color:#18181b;margin:0 0 6px">OPS email templates</h1>
    <p style="color:#71717a;margin:0 0 28px">${templates.length} rendered specimens. Click any to open full size.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px">${cards}</div>
  </div>
</body></html>`
);

console.log(`\nContact sheet:\n  open ${outDir}/index.html`);
