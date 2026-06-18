export interface ApprovalRequestEmailProps {
  stakeholderName: string;
  projectId: string;
  approvalUrl: string;
  expiresAt: string;
  pbdbUrl?: string | null;
  isFreshToken?: boolean;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderApprovalRequestEmail(props: ApprovalRequestEmailProps): string {
  const { stakeholderName, projectId, approvalUrl, expiresAt, pbdbUrl, isFreshToken } = props;
  const heading = isFreshToken ? "Reminder: approval still required" : "Approval required";
  const pbdbSection = pbdbUrl
    ? `<p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
        <a href="${e(pbdbUrl)}" style="color:#18181b;font-weight:500">Download PBDB document</a>
      </p>`
    : "";
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">${e(heading)}</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(stakeholderName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          A performance report (ref: <strong>${e(projectId)}</strong>) requires your approval. Please review and respond by <strong>${e(expiresAt)}</strong>.
        </p>
        ${pbdbSection}
        <a href="${e(approvalUrl)}" style="display:inline-block;margin-top:8px;margin-bottom:24px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Review &amp; approve</a>
        <p style="font-size:13px;color:#71717a;margin:0 0 16px">This link expires on ${e(expiresAt)}. If you have questions, reply to this email.</p>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}

export function ApprovalRequestEmail({
  stakeholderName,
  projectId,
  approvalUrl,
  expiresAt,
}: ApprovalRequestEmailProps) {
  return (
    <div style={wrapper}>
      <div style={container}>
        <h1 style={heading}>Approval required</h1>
        <p style={body}>Hi {stakeholderName},</p>
        <p style={body}>
          A performance report (ref: <strong>{projectId}</strong>) requires your approval. Please
          review and respond by <strong>{expiresAt}</strong>.
        </p>
        <a href={approvalUrl} style={button}>
          Review &amp; approve
        </a>
        <p style={note}>
          This link expires on {expiresAt}. If you have questions, reply to this email.
        </p>
        <p style={footer}>DDEG Online Performance Solution</p>
      </div>
    </div>
  );
}

const wrapper: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  padding: "40px 16px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  maxWidth: "560px",
  margin: "0 auto",
  padding: "40px",
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "600",
  color: "#18181b",
  marginTop: 0,
  marginBottom: "24px",
};

const body: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#3f3f46",
  margin: "0 0 16px",
};

const button: React.CSSProperties = {
  display: "inline-block",
  marginTop: "8px",
  marginBottom: "24px",
  backgroundColor: "#18181b",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: "500",
};

const note: React.CSSProperties = {
  fontSize: "13px",
  color: "#71717a",
  margin: "0 0 16px",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  marginTop: "24px",
  marginBottom: 0,
};
