import { renderEmailShell, e, paragraph, strong } from "./shell";

export interface PBDRDeliveryEmailProps {
  recipientName: string;
  projectId: string;
  downloadUrl: string;
  expiresAt: string;
}

export function renderPbdrDeliveryEmail(props: PBDRDeliveryEmailProps): string {
  const { recipientName, projectId, downloadUrl, expiresAt } = props;

  const body = [
    paragraph(`Hi ${e(recipientName)},`),
    paragraph(
      `Your Online Performance Report for project ${strong(projectId)} is ready to download.`,
      20
    ),
  ].join("");

  return renderEmailShell({
    status: "success",
    statusLabel: "Ready",
    heading: "Your report is ready",
    bodyHtml: body,
    cta: { label: "Download report", url: downloadUrl },
    footnote: `This download link expires on ${e(expiresAt)}.`,
  });
}
