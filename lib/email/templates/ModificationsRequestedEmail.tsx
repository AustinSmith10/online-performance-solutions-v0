export interface ModificationComment {
  stakeholderName: string;
  comments: string;
}

export interface ModificationsRequestedEmailProps {
  consultantName: string;
  projectId: string;
  modifications: ModificationComment[];
  projectUrl: string;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderModificationsRequestedEmail(props: ModificationsRequestedEmailProps): string {
  const { consultantName, projectId, modifications, projectUrl } = props;
  const count = modifications.length;
  const modBlocks = modifications
    .map(
      (m) =>
        `<div style="background-color:#f4f4f5;border-radius:6px;padding:16px;margin:0 0 12px">
          <p style="font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">${e(m.stakeholderName)}</p>
          <p style="font-size:14px;color:#3f3f46;margin:0;line-height:1.6">${e(m.comments)}</p>
        </div>`
    )
    .join("");
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Modifications requested</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(consultantName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 24px">
          ${count === 1 ? "1 stakeholder has" : `${count} stakeholders have`} requested modifications to project <strong>${e(projectId)}</strong>.
        </p>
        ${modBlocks}
        <a href="${e(projectUrl)}" style="display:inline-block;margin-top:12px;margin-bottom:24px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">View project</a>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}

export function ModificationsRequestedEmail({
  consultantName,
  projectId,
  modifications,
  projectUrl,
}: ModificationsRequestedEmailProps) {
  return (
    <div style={wrapper}>
      <div style={container}>
        <h1 style={heading}>Modifications requested</h1>
        <p style={body}>Hi {consultantName},</p>
        <p style={body}>
          {modifications.length === 1 ? "1 stakeholder has" : `${modifications.length} stakeholders have`}{" "}
          requested modifications to project <strong>{projectId}</strong>.
        </p>
        {modifications.map((m, i) => (
          <div key={i} style={commentBox}>
            <p style={commentLabel}>{m.stakeholderName}</p>
            <p style={commentText}>{m.comments}</p>
          </div>
        ))}
        <a href={projectUrl} style={button}>
          View project
        </a>
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

const commentBox: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  borderRadius: "6px",
  padding: "16px",
  margin: "0 0 12px",
};

const commentLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 8px",
};

const commentText: React.CSSProperties = {
  fontSize: "14px",
  color: "#3f3f46",
  margin: 0,
  lineHeight: "1.6",
};

const button: React.CSSProperties = {
  display: "inline-block",
  marginTop: "12px",
  marginBottom: "24px",
  backgroundColor: "#18181b",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: "500",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  marginTop: "24px",
  marginBottom: 0,
};
