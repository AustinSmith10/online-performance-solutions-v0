/**
 * One-off: send a real email via Postmark to a confirmed address you control,
 * to verify true end-to-end delivery (not just that the API call succeeded).
 *
 * Uses your real POSTMARK_SERVER_TOKEN — this is a genuine send and counts
 * against your Postmark trial's quota, which (until the account is approved
 * for production) can only deliver to your own confirmed sender/recipient
 * address. Run manually; not part of the test suite or CI.
 *
 * Usage:
 *   npx tsx --env-file .env.local scripts/send-test-email.ts <to-email> [template]
 *
 * template (default: acknowledgement):
 *   acknowledgement | welcome | pbdr-delivery | qa-complete | consultant-assigned | digest
 */
import { sendEmail } from "@/lib/email/sender";
import { AcknowledgementEmail } from "@/lib/email/templates/AcknowledgementEmail";
import { WelcomeAccountEmail } from "@/lib/email/templates/WelcomeAccountEmail";
import { renderPbdrDeliveryEmail } from "@/lib/email/templates/PBDRDeliveryEmail";
import { QaCompleteEmail } from "@/lib/email/templates/QaCompleteEmail";
import { ConsultantAssignedEmail } from "@/lib/email/templates/ConsultantAssignedEmail";
import { renderAvailableRequestsDigestEmail } from "@/lib/email/templates/AvailableRequestsDigestEmail";

const to = process.argv[2];
const template = process.argv[3] ?? "acknowledgement";

if (!to) {
  console.error("Usage: npx tsx --env-file .env.local scripts/send-test-email.ts <to-email> [template]");
  process.exit(1);
}

const TEMPLATES: Record<string, { subject: string; html: string }> = {
  acknowledgement: {
    subject: "OPS smoke test: submission received",
    html: AcknowledgementEmail({
      recipientName: "Test Recipient",
      projectId: "SMOKE-001",
      expectedDeliveryDate: "12 June 2026",
      portalUrl: "http://localhost:3000/portal",
    }),
  },
  welcome: {
    subject: "OPS smoke test: your account is ready",
    html: WelcomeAccountEmail({
      firstName: "Test",
      email: to,
      role: "consultant",
      resetLink: "http://localhost:3000/reset?token=smoke",
      appUrl: "http://localhost:3000",
    }),
  },
  "pbdr-delivery": {
    subject: "OPS smoke test: your report is ready",
    html: renderPbdrDeliveryEmail({
      recipientName: "Test Recipient",
      projectId: "SMOKE-001",
      downloadUrl: "http://localhost:3000/download?token=smoke",
      expiresAt: "19 June 2026",
    }),
  },
  "qa-complete": {
    subject: "OPS smoke test: QA complete",
    html: QaCompleteEmail({
      projectRef: "SMOKE-001",
      portalUrl: "http://localhost:3000/admin/projects/SMOKE-001",
    }),
  },
  "consultant-assigned": {
    subject: "OPS smoke test: project assigned",
    html: ConsultantAssignedEmail({
      recipientName: "Test Consultant",
      projectRef: "SMOKE-001",
      orgName: "Test Org",
      portalUrl: "http://localhost:3000/ops",
    }),
  },
  digest: {
    subject: "OPS smoke test: available requests digest",
    html: renderAvailableRequestsDigestEmail({ count: 3, portalUrl: "http://localhost:3000/ops" }),
  },
};

const chosen = TEMPLATES[template];
if (!chosen) {
  console.error(`Unknown template "${template}". Options: ${Object.keys(TEMPLATES).join(", ")}`);
  process.exit(1);
}

if (!process.env.POSTMARK_SERVER_TOKEN) {
  console.error("POSTMARK_SERVER_TOKEN is not set — nothing will send. Check .env.local.");
  process.exit(1);
}

async function main() {
  console.log(`Sending "${template}" to ${to} via Postmark (real send — uses your trial quota)...`);
  // throwOnError so a rejected send fails loudly here — sendEmail swallows
  // errors by default so application code is never blocked by email problems.
  await sendEmail({ to, subject: chosen.subject, html: chosen.html, throwOnError: true });
  console.log(
    `✅ Postmark accepted the send to ${to}.\n` +
      "   Note: accepted ≠ landed in the inbox. Confirm in the recipient's mailbox and\n" +
      "   in Postmark → your Server → Activity (look for a 'Delivered' event)."
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Send failed — nothing was delivered to ${to}.\n   ${message}`);
  process.exit(1);
});
