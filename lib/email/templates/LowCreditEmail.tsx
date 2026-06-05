export interface LowCreditEmailProps {
  recipientName: string;
  currentBalance: number;
  portalUrl: string;
}

export function LowCreditEmail({
  recipientName,
  currentBalance,
  portalUrl,
}: LowCreditEmailProps) {
  return (
    <div style={wrapper}>
      <div style={container}>
        <div style={alertBanner}>Low credit balance</div>
        <h1 style={heading}>Your credit balance is low</h1>
        <p style={body}>Hi {recipientName},</p>
        <p style={body}>
          Your account credit balance has fallen to <strong>{currentBalance} credit{currentBalance !== 1 ? "s" : ""}</strong>.
          Please contact DDEG to top up your balance before your next report submission.
        </p>
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

const alertBanner: React.CSSProperties = {
  backgroundColor: "#fef3c7",
  color: "#92400e",
  borderRadius: "4px",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: "600",
  marginBottom: "20px",
  display: "inline-block",
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

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  marginTop: "24px",
  marginBottom: 0,
};
