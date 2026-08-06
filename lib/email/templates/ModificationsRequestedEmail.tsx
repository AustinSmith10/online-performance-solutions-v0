import { renderEmailShell, e, paragraph, strong, panel } from "./shell";

export interface ModificationComment {
  stakeholderName: string;
  comments: string;
}

export interface ModificationsRequestedEmailProps {
  consultantName: string;
  projectId: string;
  modifications: ModificationComment[];
  /**
   * Stakeholders on this review cycle still awaiting response. Folds the
   * "awaiting stakeholder response" alert into this same email — both are
   * "this review cycle needs your attention" notices to the same admin
   * audience, so they no longer need to arrive as two separate emails.
   */
  awaitingResponse?: string[];
  projectUrl: string;
}

export function renderModificationsRequestedEmail(props: ModificationsRequestedEmailProps): string {
  const { consultantName, projectId, modifications, awaitingResponse = [], projectUrl } = props;
  const modCount = modifications.length;
  const awaitingCount = awaitingResponse.length;
  const hasModifications = modCount > 0;
  const hasAwaiting = awaitingCount > 0;
  const modSubject = modCount === 1 ? "1 stakeholder has" : `${modCount} stakeholders have`;

  const heading = hasModifications
    ? hasAwaiting
      ? "Review cycle needs attention"
      : "Modifications requested"
    : "Awaiting stakeholder response";
  const statusLabel = hasModifications ? "Changes requested" : "Awaiting response";

  const body = [
    paragraph(`Hi ${e(consultantName)},`),
    hasModifications
      ? paragraph(
          `${modSubject} requested modifications to project ${strong(projectId)}.`,
          hasAwaiting ? 12 : 20
        )
      : "",
    ...modifications.map((m) => panel(m.stakeholderName, e(m.comments))),
    hasAwaiting
      ? paragraph(
          `${awaitingCount} stakeholder${awaitingCount === 1 ? "" : "s"} on project ${strong(projectId)} ${awaitingCount === 1 ? "hasn't" : "haven't"} responded yet: ${awaitingResponse.map((n) => e(n)).join(", ")}.`,
          20
        )
      : "",
  ].join("");

  return renderEmailShell({
    status: "action",
    statusLabel,
    heading,
    bodyHtml: body,
    cta: { label: "View project", url: projectUrl },
  });
}
