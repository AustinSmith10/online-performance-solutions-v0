import { renderEmailShell, e, paragraph } from "./shell";

export interface AvailableRequestsDigestEmailProps {
  count: number;
  portalUrl: string;
  queueCount: number;
  queueUrl: string;
}

// Bold, underlined inline link carrying a bare count — used so each figure in
// the combined sentence links through to its own page without an itemized
// list in the body (#101).
function countLink(count: number, label: string, url: string): string {
  return `<a href="${e(url)}" style="color:#18181b;font-weight:700;text-decoration:underline">${e(String(count))} ${e(label)}</a>`;
}

export function renderAvailableRequestsDigestEmail({
  count,
  portalUrl,
  queueCount,
  queueUrl,
}: AvailableRequestsDigestEmailProps): string {
  const requestsLabel = count === 1 ? "available request" : "available requests";
  const queueLabel = queueCount === 1 ? "pending queue email" : "pending queue emails";

  const body = paragraph(
    `You have ${countLink(count, requestsLabel, portalUrl)} and ${countLink(queueCount, queueLabel, queueUrl)}.`,
    20
  );

  return renderEmailShell({
    status: "action",
    statusLabel: "Unclaimed work",
    heading: `${count} available ${count === 1 ? "request" : "requests"}, ${queueCount} pending queue ${queueCount === 1 ? "email" : "emails"}`,
    bodyHtml: body,
  });
}
