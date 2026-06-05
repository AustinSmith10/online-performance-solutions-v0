export interface CreditDeductionEmailProps {
  recipientName: string;
  projectId: string;
  creditsDeducted: number;
  newBalance: number;
  portalUrl: string;
}

export function CreditDeductionEmail({
  recipientName,
  projectId,
  creditsDeducted,
  newBalance,
  portalUrl,
}: CreditDeductionEmailProps) {
  return (
    <div style={wrapper}>
      <div style={container}>
        <h1 style={heading}>Credit deducted</h1>
        <p style={body}>Hi {recipientName},</p>
        <p style={body}>
          {creditsDeducted} credit{creditsDeducted !== 1 ? "s" : ""}{" "}
          {creditsDeducted !== 1 ? "have" : "has"} been deducted from your account for the
          delivery of project <strong>{projectId}</strong>.
        </p>
        <div style={balanceBox}>
          <p style={balanceLabel}>Remaining balance</p>
          <p style={balanceValue}>{newBalance} credits</p>
        </div>
        <a href={portalUrl} style={button}>
          View account
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

const balanceBox: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  borderRadius: "6px",
  padding: "16px",
  margin: "0 0 24px",
};

const balanceLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 4px",
};

const balanceValue: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#18181b",
  margin: 0,
};

const button: React.CSSProperties = {
  display: "inline-block",
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
