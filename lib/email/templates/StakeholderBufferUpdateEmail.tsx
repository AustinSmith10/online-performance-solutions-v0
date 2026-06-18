export interface StakeholderBufferUpdateEmailProps {
  stakeholderName: string;
  projectId: string;
  totalStakeholders: number;
  respondedCount: number;
  approvalUrl?: string | null;
  expiresAt?: string | null;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderStakeholderBufferUpdateEmail(
  props: StakeholderBufferUpdateEmailProps
): string {
  const { stakeholderName, projectId, totalStakeholders, respondedCount, approvalUrl, expiresAt } =
    props;

  const statusLine = `${respondedCount} of ${totalStakeholders} stakeholder${totalStakeholders === 1 ? "" : "s"} have responded.`;

  const actionSection =
    approvalUrl && expiresAt
      ? `<p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          Your response is still required. Please click the link below before <strong>${e(expiresAt)}</strong>.
        </p>
        <a href="${e(approvalUrl)}" style="display:inline-block;margin-top:8px;margin-bottom:24px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Submit your response</a>`
      : `<p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 24px">No further action is required from you at this time.</p>`;

  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Approval status update</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(stakeholderName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          This is an update on the approval status for report ref <strong>${e(projectId)}</strong>.
        </p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">${e(statusLine)}</p>
        ${actionSection}
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}
