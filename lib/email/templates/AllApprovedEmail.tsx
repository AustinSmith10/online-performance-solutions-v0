import { renderEmailShell, e, paragraph, strong, fieldTable } from "./shell";

export interface AllApprovedEmailProps {
  recipientName: string;
  projectRef: string;
  portalUrl: string;
}

export function renderAllApprovedEmail({
  recipientName,
  projectRef,
  portalUrl,
}: AllApprovedEmailProps): string {
  const body = [
    paragraph(`Hi ${e(recipientName)},`),
    paragraph(
      `All stakeholders have approved ${strong(projectRef)}. Your report is now being finalised and is on its way to delivery.`
    ),
    fieldTable([{ label: "Project", value: e(projectRef) }]),
    paragraph("We'll be in touch as soon as it's ready to download.", 20),
  ].join("");

  return renderEmailShell({
    status: "success",
    statusLabel: "All approvals in",
    heading: "Your report is being finalised",
    bodyHtml: body,
    cta: { label: "View your project", url: portalUrl },
  });
}
