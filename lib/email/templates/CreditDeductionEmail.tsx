import { renderEmailShell, e, paragraph, strong, fieldTable } from "./shell";

export interface CreditDeductionEmailProps {
  orgName: string;
  projectRef: string;
  creditsDeducted: number;
  newBalance: number;
  portalUrl: string;
}

// Addressed to the organisation rather than an individual: this notification fans
// out to every client user on the org plus all admins, who share no common greeting.
export function renderCreditDeductionEmail({
  orgName,
  projectRef,
  creditsDeducted,
  newBalance,
  portalUrl,
}: CreditDeductionEmailProps): string {
  const creditNoun = creditsDeducted === 1 ? "credit" : "credits";
  const verb = creditsDeducted === 1 ? "has" : "have";
  const balanceNoun = newBalance === 1 ? "credit" : "credits";

  const body = [
    paragraph(
      `${e(String(creditsDeducted))} ${creditNoun} ${verb} been deducted from ${strong(orgName)} for the delivery of project ${strong(projectRef)}.`
    ),
    fieldTable([{ label: "Remaining balance", value: `${e(String(newBalance))} ${balanceNoun}` }]),
  ].join("");

  return renderEmailShell({
    status: newBalance < 3 ? "action" : "info",
    statusLabel: "Credit deducted",
    heading: "Credit deducted",
    bodyHtml: body,
    cta: { label: "View account", url: portalUrl },
  });
}
