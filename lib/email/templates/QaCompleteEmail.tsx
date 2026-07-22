import { renderEmailShell, paragraph, strong } from "./shell";

export interface QaCompleteEmailProps {
  projectRef: string;
  portalUrl: string;
}

export function QaCompleteEmail({ projectRef, portalUrl }: QaCompleteEmailProps): string {
  const body = paragraph(
    `The consultant has marked QA complete for project ${strong(projectRef)}. The PBDB is being dispatched to stakeholders for approval now.`,
    20
  );

  return renderEmailShell({
    status: "info",
    statusLabel: "QA complete",
    heading: "QA complete — dispatching to stakeholders",
    bodyHtml: body,
    cta: { label: "Open project", url: portalUrl },
  });
}
