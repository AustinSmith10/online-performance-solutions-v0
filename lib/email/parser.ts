export interface PostmarkAttachment {
  Name: string;
  Content: string; // base64-encoded file data
  ContentType: string;
  ContentLength: number;
  ContentID?: string;
}

export interface PostmarkInboundEmail {
  From: string;
  FromName: string;
  FromFull: { Email: string; Name: string; MailboxHash: string };
  To: string;
  Subject: string;
  TextBody: string;
  HtmlBody: string;
  MailboxHash: string;
  Attachments: PostmarkAttachment[];
  MessageID: string;
  Date: string;
}

export function parseInboundPayload(body: unknown): PostmarkInboundEmail | null {
  if (!body || typeof body !== "object") return null;
  const p = body as Record<string, unknown>;
  if (typeof p.From !== "string") return null;

  return {
    From: p.From,
    FromName: typeof p.FromName === "string" ? p.FromName : "",
    FromFull:
      p.FromFull && typeof p.FromFull === "object"
        ? (p.FromFull as PostmarkInboundEmail["FromFull"])
        : { Email: p.From, Name: "", MailboxHash: "" },
    To: typeof p.To === "string" ? p.To : "",
    Subject: typeof p.Subject === "string" ? p.Subject : "",
    TextBody: typeof p.TextBody === "string" ? p.TextBody : "",
    HtmlBody: typeof p.HtmlBody === "string" ? p.HtmlBody : "",
    MailboxHash: typeof p.MailboxHash === "string" ? p.MailboxHash : "",
    Attachments: Array.isArray(p.Attachments)
      ? (p.Attachments as PostmarkAttachment[])
      : [],
    MessageID: typeof p.MessageID === "string" ? p.MessageID : "",
    Date: typeof p.Date === "string" ? p.Date : "",
  };
}

export function senderEmail(payload: PostmarkInboundEmail): string {
  return (payload.FromFull?.Email || payload.From).toLowerCase().trim();
}

const SUPPORTED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
]);

export function isSupportedAttachment(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType.toLowerCase().split(";")[0].trim());
}

export function attachmentBuffer(attachment: PostmarkAttachment): Buffer {
  return Buffer.from(attachment.Content, "base64");
}

export function buildInboundReplyTo(projectId: string): string {
  const hash = process.env.POSTMARK_INBOUND_HASH;
  if (!hash) return "";
  return `ops+${projectId}@${hash}.inbound.postmarkapp.com`;
}
