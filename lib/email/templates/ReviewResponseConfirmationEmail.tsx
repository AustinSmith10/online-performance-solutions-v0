import { renderEmailShell, e, paragraph, strong, fieldTable, quote } from "./shell";

export interface ReviewResponseConfirmationEmailProps {
  recipientName: string;
  projectRef: string;
  response: "approved" | "rejected";
  comments: string | null;
  portalUrl: string;
}

export function renderReviewResponseConfirmationEmail({
  recipientName,
  projectRef,
  response,
  comments,
  portalUrl,
}: ReviewResponseConfirmationEmailProps): string {
  const approved = response === "approved";
  const action = approved ? "approved" : "requested changes to";
  const badgeText = approved ? "Approved" : "Changes requested";
  const badgeBg = approved ? "#dcfce7" : "#fee2e2";
  const badgeColor = approved ? "#166534" : "#991b1b";

  const badge = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="background-color:${badgeBg};border-radius:999px;padding:3px 10px"><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:${badgeColor}">${e(badgeText)}</span></td></tr></table>`;

  const body = [
    paragraph(`Hi ${e(recipientName)},`),
    paragraph(`Your response for ${strong(projectRef)} has been recorded. You ${e(action)} the PBDB.`),
    fieldTable([
      { label: "Project", value: e(projectRef) },
      { label: "Your response", value: badge },
    ]),
    comments ? quote(comments) : "",
    paragraph(
      approved
        ? "Thank you for your approval. We'll be in touch once the final report is ready."
        : "Our team has been notified and will review your feedback. You'll hear from us once the document has been updated.",
      20
    ),
  ].join("");

  return renderEmailShell({
    status: approved ? "success" : "action",
    statusLabel: "Response recorded",
    heading: "Review response recorded",
    bodyHtml: body,
    cta: { label: "View your project", url: portalUrl },
  });
}
