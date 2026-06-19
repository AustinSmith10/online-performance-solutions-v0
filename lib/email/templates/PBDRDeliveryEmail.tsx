function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderPbdrDeliveryEmail(props: PBDRDeliveryEmailProps): string {
  const { recipientName, projectId, downloadUrl, expiresAt } = props;
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Your report is ready</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(recipientName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          Your Online Performance Report for project <strong>${e(projectId)}</strong> is ready to download.
        </p>
        <a href="${e(downloadUrl)}" style="display:inline-block;margin-top:8px;margin-bottom:16px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Download report</a>
        <p style="font-size:13px;color:#71717a;margin:0 0 16px">This download link expires on ${e(expiresAt)}.</p>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}

export interface PBDRDeliveryEmailProps {
  recipientName: string;
  projectId: string;
  downloadUrl: string;
  expiresAt: string;
}

export function PBDRDeliveryEmail({
  recipientName,
  projectId,
  downloadUrl,
  expiresAt,
}: PBDRDeliveryEmailProps) {
  return (
    <div style={wrapper}>
      <div style={container}>
        <h1 style={heading}>Your report is ready</h1>
        <p style={body}>Hi {recipientName},</p>
        <p style={body}>
          Your Online Performance Report for project <strong>{projectId}</strong> is ready to
          download.
        </p>
        <a href={downloadUrl} style={button}>
          Download report
        </a>
        <p style={note}>This download link expires on {expiresAt}.</p>
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
  marginBottom: "16px",
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
