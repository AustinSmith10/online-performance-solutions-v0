export interface RevisionNoticeEmailProps {
  stakeholderName: string;
  projectId: string;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderRevisionNoticeEmail(props: RevisionNoticeEmailProps): string {
  const { stakeholderName, projectId } = props;
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Document revised — new approval request incoming</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(stakeholderName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          The performance report (ref: <strong>${e(projectId)}</strong>) has been revised in response to stakeholder feedback.
          Your previous approval has been reset.
        </p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 24px">
          You will receive a separate email shortly with a new approval link for the revised document.
        </p>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}
