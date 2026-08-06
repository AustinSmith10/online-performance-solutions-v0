import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/config/support";
import { renderEmailShell, e, paragraph, strong, fieldTable, noticeBox } from "./shell";

export interface CreditDeductionEmailProps {
  orgName: string;
  projectRef: string;
  creditsDeducted: number;
  newBalance: number;
  portalUrl: string;
  /** Balance below which new report requests will soon be blocked. */
  lowBalanceThreshold?: number;
}

// Addressed to the organisation rather than an individual: this notification fans
// out to every client user on the org plus all admins, who share no common greeting.
//
// Covers both "a credit was deducted" and "the balance is now low" in one
// email — they share the same recipients and the same trigger site (a
// deduction is what drops the balance), so a separate low-balance email
// arriving moments later was pure duplication.
export function renderCreditDeductionEmail({
  orgName,
  projectRef,
  creditsDeducted,
  newBalance,
  portalUrl,
  lowBalanceThreshold = 3,
}: CreditDeductionEmailProps): string {
  const creditNoun = creditsDeducted === 1 ? "credit" : "credits";
  const verb = creditsDeducted === 1 ? "has" : "have";
  const balanceNoun = newBalance === 1 ? "credit" : "credits";
  const isLow = newBalance < lowBalanceThreshold;

  const body = [
    paragraph(
      `${e(String(creditsDeducted))} ${creditNoun} ${verb} been deducted from ${strong(orgName)} for the delivery of project ${strong(projectRef)}.`
    ),
    fieldTable([{ label: "Remaining balance", value: `${e(String(newBalance))} ${balanceNoun}` }]),
    isLow
      ? noticeBox(
          `This balance will soon block new report requests. <a href="${SUPPORT_MAILTO}" style="color:#92400e;text-decoration:underline">Contact DDEG</a> (${SUPPORT_EMAIL}) to top up.`,
          "action"
        )
      : "",
  ].join("");

  return renderEmailShell({
    status: isLow ? "action" : "info",
    statusLabel: isLow ? "Low balance" : "Credit deducted",
    heading: isLow ? "Credit deducted — balance now low" : "Credit deducted",
    bodyHtml: body,
    cta: { label: "View account", url: portalUrl },
  });
}
