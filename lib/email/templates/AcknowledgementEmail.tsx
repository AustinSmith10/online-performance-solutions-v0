import { renderEmailShell, e, paragraph, fieldTable } from "./shell";

export interface AcknowledgementEmailProps {
  recipientName: string;
  projectId: string;
  expectedDeliveryDate: string;
  portalUrl: string;
  poNumber?: string | null;
}

export function AcknowledgementEmail({
  recipientName,
  projectId,
  expectedDeliveryDate,
  portalUrl,
  poNumber,
}: AcknowledgementEmailProps): string {
  const body = [
    paragraph(`Hi ${e(recipientName)},`),
    paragraph("Thank you for submitting your request. We'll be in touch once your report is ready."),
    fieldTable([
      { label: "Reference", value: e(projectId) },
      ...(poNumber ? [{ label: "PO number", value: e(poNumber) }] : []),
      { label: "Report due by", value: e(expectedDeliveryDate) },
    ]),
  ].join("");

  return renderEmailShell({
    status: "success",
    statusLabel: "Received",
    heading: "Submission received",
    bodyHtml: body,
    cta: { label: "View your submission", url: portalUrl },
  });
}
