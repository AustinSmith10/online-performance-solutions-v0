import { renderEmailShell, e, paragraph, strong, panel } from "./shell";

export interface ModificationComment {
  stakeholderName: string;
  comments: string;
}

export interface ModificationsRequestedEmailProps {
  consultantName: string;
  projectId: string;
  modifications: ModificationComment[];
  projectUrl: string;
}

export function renderModificationsRequestedEmail(props: ModificationsRequestedEmailProps): string {
  const { consultantName, projectId, modifications, projectUrl } = props;
  const count = modifications.length;
  const subject = count === 1 ? "1 stakeholder has" : `${count} stakeholders have`;

  const body = [
    paragraph(`Hi ${e(consultantName)},`),
    paragraph(`${subject} requested modifications to project ${strong(projectId)}.`, 20),
    ...modifications.map((m) => panel(m.stakeholderName, e(m.comments))),
  ].join("");

  return renderEmailShell({
    status: "action",
    statusLabel: "Changes requested",
    heading: "Modifications requested",
    bodyHtml: body,
    cta: { label: "View project", url: projectUrl },
  });
}
