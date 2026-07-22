import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/config/support";
import { renderEmailShell, e, paragraph, strong, noticeBox } from "./shell";

export interface LowCreditEmailProps {
  orgName: string;
  currentBalance: number;
  portalUrl: string;
}

// Addressed to the organisation rather than an individual: this notification fans
// out to every client user on the org plus all admins, who share no common greeting.
export function renderLowCreditEmail({
  orgName,
  currentBalance,
  portalUrl,
}: LowCreditEmailProps): string {
  const balanceNoun = currentBalance === 1 ? "credit" : "credits";

  const body = [
    paragraph(`The credit balance for ${strong(orgName)} has fallen to a level that will soon block new report requests.`),
    noticeBox(
      `Remaining balance: <strong>${e(String(currentBalance))} ${balanceNoun}</strong>`,
      "action"
    ),
    paragraph(
      `Please <a href="${SUPPORT_MAILTO}" style="color:#18181b;text-decoration:underline">contact DDEG</a> (${SUPPORT_EMAIL}) to top up the balance before the next report submission.`,
      20
    ),
  ].join("");

  return renderEmailShell({
    status: "action",
    statusLabel: "Low balance",
    heading: "Credit balance is low",
    bodyHtml: body,
    cta: { label: "View account", url: portalUrl },
  });
}
