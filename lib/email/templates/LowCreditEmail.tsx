import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/config/support";

export interface LowCreditEmailProps {
  orgName: string;
  currentBalance: number;
  portalUrl: string;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Addressed to the organisation rather than an individual: this notification fans
// out to every client user on the org plus all admins, who share no common greeting.
export function renderLowCreditEmail({
  orgName,
  currentBalance,
  portalUrl,
}: LowCreditEmailProps): string {
  const balanceNoun = currentBalance === 1 ? "credit" : "credits";
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <div style="background-color:#fef3c7;color:#92400e;border-radius:4px;padding:8px 12px;font-size:13px;font-weight:600;margin-bottom:20px;display:inline-block">Low credit balance</div>
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Credit balance is low</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          The credit balance for <strong>${e(orgName)}</strong> has fallen to
          <strong>${e(String(currentBalance))} ${balanceNoun}</strong>.
          Please <a href="${SUPPORT_MAILTO}" style="color:#18181b">contact DDEG</a> (${SUPPORT_EMAIL})
          to top up the balance before the next report submission.
        </p>
        <a href="${e(portalUrl)}" style="display:inline-block;margin-top:8px;margin-bottom:24px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">View account</a>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}
