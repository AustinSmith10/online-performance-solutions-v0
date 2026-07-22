import { renderEmailShell, e, paragraph } from "./shell";

export interface AvailableRequestsDigestEmailProps {
  count: number;
  portalUrl: string;
}

export function renderAvailableRequestsDigestEmail({
  count,
  portalUrl,
}: AvailableRequestsDigestEmailProps): string {
  const noun = count === 1 ? "request" : "requests";
  const verb = count === 1 ? "is" : "are";

  const body = paragraph(
    `There ${verb} currently <strong style="color:#18181b">${e(String(count))} ${noun}</strong> submitted and awaiting a consultant to pick up.`,
    20
  );

  return renderEmailShell({
    status: "action",
    statusLabel: "Unclaimed work",
    heading: `You have ${count} available ${noun}`,
    bodyHtml: body,
    cta: { label: "View available requests", url: portalUrl },
  });
}
