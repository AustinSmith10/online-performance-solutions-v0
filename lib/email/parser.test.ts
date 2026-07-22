import { describe, it, expect, afterEach } from "vitest";
import {
  parseInboundPayload,
  senderEmail,
  isSupportedAttachment,
  attachmentBuffer,
  buildInboundReplyTo,
  buildStakeholderReplyTo,
} from "./parser";

const MINIMAL_VALID = {
  From: "client@example.com",
  FromName: "Jane Client",
  FromFull: { Email: "client@example.com", Name: "Jane Client", MailboxHash: "" },
  To: "ops@inbound.example.com",
  Subject: "Report request",
  TextBody: "Please find attached.",
  HtmlBody: "<p>Please find attached.</p>",
  MailboxHash: "",
  Attachments: [],
  MessageID: "msg-123",
  Date: "2024-01-15T09:00:00Z",
};

describe("parseInboundPayload", () => {
  it("returns a parsed object for a valid Postmark payload", () => {
    const result = parseInboundPayload(MINIMAL_VALID);
    expect(result).not.toBeNull();
    expect(result?.From).toBe("client@example.com");
    expect(result?.Subject).toBe("Report request");
    expect(result?.Attachments).toEqual([]);
  });

  it("returns null for null input", () => {
    expect(parseInboundPayload(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseInboundPayload("string")).toBeNull();
    expect(parseInboundPayload(42)).toBeNull();
    expect(parseInboundPayload(undefined)).toBeNull();
  });

  it("returns null when From field is missing", () => {
    const { From: _, ...noFrom } = MINIMAL_VALID;
    expect(parseInboundPayload(noFrom)).toBeNull();
  });

  it("returns null when From is not a string", () => {
    expect(parseInboundPayload({ ...MINIMAL_VALID, From: 123 })).toBeNull();
  });

  it("falls back sensibly when optional fields are missing", () => {
    const result = parseInboundPayload({ From: "a@b.com" });
    expect(result).not.toBeNull();
    expect(result?.Subject).toBe("");
    expect(result?.TextBody).toBe("");
    expect(result?.MailboxHash).toBe("");
    expect(result?.Attachments).toEqual([]);
  });

  it("uses From as FromFull.Email when FromFull is absent", () => {
    const { FromFull: _, ...noFromFull } = MINIMAL_VALID;
    const result = parseInboundPayload(noFromFull);
    expect(result?.FromFull.Email).toBe("client@example.com");
  });

  it("parses attachments array", () => {
    const payload = {
      ...MINIMAL_VALID,
      Attachments: [
        { Name: "plans.pdf", Content: "abc123", ContentType: "application/pdf", ContentLength: 1024 },
      ],
    };
    const result = parseInboundPayload(payload);
    expect(result?.Attachments).toHaveLength(1);
    expect(result?.Attachments[0].Name).toBe("plans.pdf");
  });

  it("treats non-array Attachments as empty array", () => {
    const result = parseInboundPayload({ ...MINIMAL_VALID, Attachments: "not-an-array" });
    expect(result?.Attachments).toEqual([]);
  });

  it("captures MailboxHash for threading", () => {
    const result = parseInboundPayload({ ...MINIMAL_VALID, MailboxHash: "project-uuid-here" });
    expect(result?.MailboxHash).toBe("project-uuid-here");
  });
});

describe("senderEmail", () => {
  it("returns FromFull.Email in lowercase", () => {
    const payload = parseInboundPayload({
      ...MINIMAL_VALID,
      FromFull: { Email: "Client@Example.COM", Name: "Jane", MailboxHash: "" },
    })!;
    expect(senderEmail(payload)).toBe("client@example.com");
  });

  it("trims whitespace from the email", () => {
    const payload = parseInboundPayload({
      ...MINIMAL_VALID,
      FromFull: { Email: "  client@example.com  ", Name: "Jane", MailboxHash: "" },
    })!;
    expect(senderEmail(payload)).toBe("client@example.com");
  });

  it("falls back to From when FromFull.Email is empty", () => {
    const payload = parseInboundPayload({
      ...MINIMAL_VALID,
      From: "fallback@example.com",
      FromFull: { Email: "", Name: "", MailboxHash: "" },
    })!;
    // empty string is falsy → falls back to From
    expect(senderEmail(payload)).toBe("fallback@example.com");
  });
});

describe("isSupportedAttachment", () => {
  it("accepts application/pdf", () => {
    expect(isSupportedAttachment("application/pdf")).toBe(true);
  });

  it("accepts image/jpeg", () => {
    expect(isSupportedAttachment("image/jpeg")).toBe(true);
  });

  it("accepts image/png", () => {
    expect(isSupportedAttachment("image/png")).toBe(true);
  });

  it("accepts image/tiff", () => {
    expect(isSupportedAttachment("image/tiff")).toBe(true);
  });

  it("rejects text/plain", () => {
    expect(isSupportedAttachment("text/plain")).toBe(false);
  });

  it("rejects application/msword", () => {
    expect(isSupportedAttachment("application/msword")).toBe(false);
  });

  it("handles Content-Type with charset parameter", () => {
    expect(isSupportedAttachment("application/pdf; charset=utf-8")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSupportedAttachment("Application/PDF")).toBe(true);
    expect(isSupportedAttachment("IMAGE/JPEG")).toBe(true);
  });
});

describe("attachmentBuffer", () => {
  it("decodes base64 content to a Buffer", () => {
    const original = "Hello, world!";
    const base64 = Buffer.from(original).toString("base64");
    const buf = attachmentBuffer({
      Name: "test.txt",
      Content: base64,
      ContentType: "text/plain",
      ContentLength: original.length,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString("utf8")).toBe(original);
  });

  it("handles empty content", () => {
    const buf = attachmentBuffer({
      Name: "empty.pdf",
      Content: "",
      ContentType: "application/pdf",
      ContentLength: 0,
    });
    expect(buf.length).toBe(0);
  });
});

describe("buildInboundReplyTo", () => {
  const originalEnv = process.env.POSTMARK_INBOUND_HASH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.POSTMARK_INBOUND_HASH;
    } else {
      process.env.POSTMARK_INBOUND_HASH = originalEnv;
    }
  });

  it("returns empty string when POSTMARK_INBOUND_HASH is not set", () => {
    delete process.env.POSTMARK_INBOUND_HASH;
    expect(buildInboundReplyTo("proj-123")).toBe("");
  });

  it("returns a correctly formatted reply-to address when hash is set", () => {
    process.env.POSTMARK_INBOUND_HASH = "abc123hash";
    expect(buildInboundReplyTo("proj-uuid")).toBe(
      "abc123hash+proj-uuid@inbound.postmarkapp.com"
    );
  });

  it("embeds the project ID in the mailbox hash position", () => {
    process.env.POSTMARK_INBOUND_HASH = "myhash";
    const result = buildInboundReplyTo("550e8400-e29b-41d4-a716-446655440000");
    expect(result).toContain("550e8400-e29b-41d4-a716-446655440000");
  });
});

describe("buildStakeholderReplyTo", () => {
  const originalEnv = process.env.POSTMARK_INBOUND_HASH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.POSTMARK_INBOUND_HASH;
    } else {
      process.env.POSTMARK_INBOUND_HASH = originalEnv;
    }
  });

  it("returns empty string when POSTMARK_INBOUND_HASH is not set", () => {
    delete process.env.POSTMARK_INBOUND_HASH;
    expect(buildStakeholderReplyTo("some-token")).toBe("");
  });

  it("embeds the stakeholder review token in the mailbox hash position", () => {
    process.env.POSTMARK_INBOUND_HASH = "abc123hash";
    expect(buildStakeholderReplyTo("review-token-xyz")).toBe(
      "abc123hash+review-token-xyz@inbound.postmarkapp.com"
    );
  });
});
