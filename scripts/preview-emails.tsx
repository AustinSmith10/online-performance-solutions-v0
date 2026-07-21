/**
 * Renders all email templates to HTML and writes them to /tmp/email-previews/.
 * Run with: npx tsx scripts/preview-emails.tsx
 * Then open the .html files in a browser.
 */
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import * as React from "react";

import { AcknowledgementEmail } from "../lib/email/templates/AcknowledgementEmail";
import { ApprovalRequestEmail } from "../lib/email/templates/ApprovalRequestEmail";
import { ModificationsRequestedEmail } from "../lib/email/templates/ModificationsRequestedEmail";
import { PBDRDeliveryEmail } from "../lib/email/templates/PBDRDeliveryEmail";
import { renderCreditDeductionEmail } from "../lib/email/templates/CreditDeductionEmail";
import { renderLowCreditEmail } from "../lib/email/templates/LowCreditEmail";

// Templates are a mix of React components and plain HTML-string renderers,
// so each entry supplies either an `element` or a ready-made `html` string.
const templates: { name: string; element?: React.ReactElement; html?: string }[] = [
  {
    name: "AcknowledgementEmail",
    element: React.createElement(AcknowledgementEmail, {
      recipientName: "Jane Smith",
      projectId: "OPS-2026-001",
      expectedDeliveryDate: "12 Jun 2026",
      portalUrl: "http://localhost:3000/portal",
    }),
  },
  {
    name: "ApprovalRequestEmail",
    element: React.createElement(ApprovalRequestEmail, {
      stakeholderName: "Bob Johnson",
      projectId: "OPS-2026-001",
      approvalUrl: "http://localhost:3000/approve?token=abc123",
      expiresAt: "10 Jun 2026",
    }),
  },
  {
    name: "ModificationsRequestedEmail",
    element: React.createElement(ModificationsRequestedEmail, {
      consultantName: "Alex Lee",
      projectId: "OPS-2026-001",
      modifications: [
        {
          stakeholderName: "Jane Smith",
          comments: "Please update the energy star rating on page 3 — it should be 4.5, not 4.0.",
        },
      ],
      projectUrl: "http://localhost:3000/admin/projects/OPS-2026-001",
    }),
  },
  {
    name: "PBDRDeliveryEmail",
    element: React.createElement(PBDRDeliveryEmail, {
      recipientName: "Jane Smith",
      projectId: "OPS-2026-001",
      downloadUrl: "http://localhost:3000/download?token=xyz789",
      expiresAt: "19 Jun 2026",
    }),
  },
  {
    name: "CreditDeductionEmail",
    html: renderCreditDeductionEmail({
      orgName: "Acme Builders",
      projectRef: "OPS-2026-001",
      creditsDeducted: 1,
      newBalance: 4,
      portalUrl: "http://localhost:3000/portal",
    }),
  },
  {
    name: "LowCreditEmail",
    html: renderLowCreditEmail({
      orgName: "Acme Builders",
      currentBalance: 1,
      portalUrl: "http://localhost:3000/portal",
    }),
  },
];

const outDir = "/tmp/email-previews";
fs.mkdirSync(outDir, { recursive: true });

for (const { name, element, html: rendered } of templates) {
  const body = rendered ?? renderToStaticMarkup(element!);
  const html = `<!DOCTYPE html>\n<html>\n<body>\n${body}\n</body>\n</html>`;
  const outPath = path.join(outDir, `${name}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`wrote ${outPath}`);
}

console.log(`\nOpen in browser:\n  open ${outDir}`);
