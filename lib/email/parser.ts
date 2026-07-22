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
  // Postmark's own quote/signature-stripped version of TextBody, populated
  // when it detects the message is a reply. Present on our real inbound
  // stream; absent on hand-built test payloads. Structural stripping only —
  // not an AI interpretation of the content (#68 requires no auto-decisioning).
  StrippedTextReply: string;
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
    StrippedTextReply: typeof p.StrippedTextReply === "string" ? p.StrippedTextReply : "",
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

// Postmark's hosted inbound address is `<inbound-hash>+<MailboxHash>@inbound.postmarkapp.com`
// — the server hash is the local part, and the domain is always the bare
// inbound.postmarkapp.com. (It is NOT `<hash>.inbound.postmarkapp.com`: that
// subdomain does not resolve, so replies to it never reach Postmark at all.)
export function buildInboundReplyTo(projectId: string): string {
  const hash = process.env.POSTMARK_INBOUND_HASH;
  if (!hash) return "";
  return `${hash}+${projectId}@inbound.postmarkapp.com`;
}

// Same MailboxHash mechanism as buildInboundReplyTo, keyed on a stakeholder
// review's token instead of a project id, so a reply lands back on the
// specific stakeholder_reviews row it was sent for (#68).
export function buildStakeholderReplyTo(token: string): string {
  const hash = process.env.POSTMARK_INBOUND_HASH;
  if (!hash) return "";
  return `${hash}+${token}@inbound.postmarkapp.com`;
}
