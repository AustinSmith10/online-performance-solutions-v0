import { renderEmailShell, e, paragraph, strong, noticeBox, link } from "./shell";

export interface ApprovalRequestEmailProps {
  stakeholderName: string;
  projectId: string;
  approvalUrl: string;
  expiresAt: string;
  pbdbUrl?: string | null;
  isFreshToken?: boolean;
}

export function renderApprovalRequestEmail(props: ApprovalRequestEmailProps): string {
  const { stakeholderName, projectId, approvalUrl, expiresAt, pbdbUrl, isFreshToken } = props;
  const heading = isFreshToken ? "Reminder: approval still required" : "Approval required";

  const body = [
    paragraph(`Hi ${e(stakeholderName)},`),
    paragraph(`A performance report (ref: ${strong(projectId)}) requires your approval.`),
    noticeBox(`Responses close <strong>${e(expiresAt)}</strong>.`, "action"),
    pbdbUrl ? paragraph(link("Download PBDB document", pbdbUrl)) : "",
  ].join("");

  return renderEmailShell({
    status: "action",
    statusLabel: isFreshToken ? "Still open" : "Action needed",
    heading,
    bodyHtml: body,
    cta: { label: "Review & approve", url: approvalUrl },
    footnote: "If you have questions, just reply to this email.",
  });
}
