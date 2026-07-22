import { renderEmailShell, e, paragraph, strong } from "./shell";

export interface ConsultantAssignedEmailProps {
  recipientName: string;
  projectRef: string;
  orgName: string;
  portalUrl: string;
}

export function ConsultantAssignedEmail({
  recipientName,
  projectRef,
  orgName,
  portalUrl,
}: ConsultantAssignedEmailProps): string {
  const body = [
    paragraph(`Hi ${e(recipientName)},`),
    paragraph(
      `You have been assigned to project ${strong(projectRef)} for ${strong(orgName)}. Please log in to review the submission details.`,
      20
    ),
  ].join("");

  return renderEmailShell({
    status: "action",
    statusLabel: "Assigned to you",
    heading: "Project assigned to you",
    bodyHtml: body,
    cta: { label: "Open workspace", url: portalUrl },
  });
}
