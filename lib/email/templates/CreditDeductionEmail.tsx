export interface CreditDeductionEmailProps {
  orgName: string;
  projectRef: string;
  creditsDeducted: number;
  newBalance: number;
  portalUrl: string;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Credit deducted</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          ${e(String(creditsDeducted))} ${creditNoun} ${verb} been deducted from
          <strong>${e(orgName)}</strong> for the delivery of project <strong>${e(projectRef)}</strong>.
        </p>
        <div style="background-color:#f4f4f5;border-radius:6px;padding:16px;margin:0 0 24px">
          <p style="font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px">Remaining balance</p>
          <p style="font-size:24px;font-weight:600;color:#18181b;margin:0">${e(String(newBalance))} ${balanceNoun}</p>
        </div>
        <a href="${e(portalUrl)}" style="display:inline-block;margin-bottom:24px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">View account</a>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}
