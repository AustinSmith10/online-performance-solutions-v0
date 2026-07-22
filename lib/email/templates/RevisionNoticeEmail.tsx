import { renderEmailShell, e, paragraph, strong, quote } from "./shell";

export interface RevisionNoticeEmailProps {
  stakeholderName: string;
  projectId: string;
  note?: string | null;
}

export function renderRevisionNoticeEmail(props: RevisionNoticeEmailProps): string {
  const { stakeholderName, projectId, note } = props;

  const body = [
    paragraph(`Hi ${e(stakeholderName)},`),
    paragraph(
      `The performance report (ref: ${strong(projectId)}) has been revised in response to stakeholder feedback. Your previous approval has been reset.`
    ),
    note ? quote(note) : "",
    paragraph(
      "You will receive a separate email shortly with a new approval link for the revised document.",
      0
    ),
  ].join("");

  // Informational only — deliberately carries no approval link; the tokenised
  // request follows in its own email.
  return renderEmailShell({
    status: "info",
    statusLabel: "No action yet",
    heading: "Document revised — new approval request incoming",
    bodyHtml: body,
  });
}
