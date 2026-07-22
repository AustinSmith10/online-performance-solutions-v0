import { renderEmailShell, e, paragraph, strong, noticeBox } from "./shell";

export interface StakeholderBufferUpdateEmailProps {
  stakeholderName: string;
  projectId: string;
  totalStakeholders: number;
  respondedCount: number;
  approvalUrl?: string | null;
  expiresAt?: string | null;
}

export function renderStakeholderBufferUpdateEmail(
  props: StakeholderBufferUpdateEmailProps
): string {
  const { stakeholderName, projectId, totalStakeholders, respondedCount, approvalUrl, expiresAt } =
    props;

  const statusLine = `${respondedCount} of ${totalStakeholders} stakeholder${totalStakeholders === 1 ? "" : "s"} have responded.`;
  const stillNeedsResponse = Boolean(approvalUrl && expiresAt);

  const body = [
    paragraph(`Hi ${e(stakeholderName)},`),
    paragraph(`This is an update on the approval status for report ref ${strong(projectId)}.`),
    noticeBox(e(statusLine), stillNeedsResponse ? "action" : "info"),
    stillNeedsResponse
      ? paragraph(
          `Your response is still required. Please use the button below before ${strong(expiresAt as string)}.`,
          20
        )
      : paragraph("No further action is required from you at this time.", 20),
  ].join("");

  return renderEmailShell({
    status: stillNeedsResponse ? "action" : "info",
    statusLabel: stillNeedsResponse ? "Action needed" : "For information",
    heading: "Approval status update",
    bodyHtml: body,
    cta: stillNeedsResponse ? { label: "Submit your response", url: approvalUrl as string } : null,
  });
}
