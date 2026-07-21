import { describe, it, expect, vi } from "vitest";
import { sendEmail } from "./sender";

// ─── no-token no-op (always runs, no network) ─────────────────────────────────

describe("sendEmail without a Postmark token configured", () => {
  it("warns and no-ops instead of sending", async () => {
    const original = process.env.POSTMARK_SERVER_TOKEN;
    delete process.env.POSTMARK_SERVER_TOKEN;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      sendEmail({ to: "nobody@example.com", subject: "s", html: "<p>h</p>" })
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("POSTMARK_SERVER_TOKEN not set"));

    warnSpy.mockRestore();
    if (original !== undefined) process.env.POSTMARK_SERVER_TOKEN = original;
  });

  it("throws instead of no-opping when throwOnError is set", async () => {
    const original = process.env.POSTMARK_SERVER_TOKEN;
    delete process.env.POSTMARK_SERVER_TOKEN;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      sendEmail({ to: "nobody@example.com", subject: "s", html: "<p>h</p>", throwOnError: true })
    ).rejects.toThrow("nothing was sent");

    warnSpy.mockRestore();
    if (original !== undefined) process.env.POSTMARK_SERVER_TOKEN = original;
  });
});

// ─── real Postmark API call, using Postmark's free test token ────────────────
//
// "POSTMARK_API_TEST" is a special server token Postmark documents for exactly
// this purpose: it exercises the real API (auth, payload validation, response
// shape) but never actually delivers mail or touches any account's send quota.
// No Postmark account or real credentials are required to run this test.
//
// Skipped by default since it's a real network call — opt in with:
//   RUN_EMAIL_INTEGRATION_TESTS=1 npm test -- lib/email/sender.test.ts

const RUN_INTEGRATION = process.env.RUN_EMAIL_INTEGRATION_TESTS === "1";

describe.skipIf(!RUN_INTEGRATION)("sendEmail against the real Postmark API (test token)", () => {
  it("sends without the internal error handler firing", async () => {
    const original = process.env.POSTMARK_SERVER_TOKEN;
    process.env.POSTMARK_SERVER_TOKEN = "POSTMARK_API_TEST";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendEmail({
      to: "test@example.com",
      subject: "OPS integration test (POSTMARK_API_TEST — not actually delivered)",
      html: "<p>This is a Postmark test-token send; nothing is delivered.</p>",
    });

    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    if (original !== undefined) process.env.POSTMARK_SERVER_TOKEN = original;
    else delete process.env.POSTMARK_SERVER_TOKEN;
  });

  it("still succeeds with a replyTo address set", async () => {
    const original = process.env.POSTMARK_SERVER_TOKEN;
    process.env.POSTMARK_SERVER_TOKEN = "POSTMARK_API_TEST";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendEmail({
      to: "test@example.com",
      subject: "OPS integration test — replyTo",
      html: "<p>test</p>",
      replyTo: "reply-test@example.com",
    });

    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    if (original !== undefined) process.env.POSTMARK_SERVER_TOKEN = original;
    else delete process.env.POSTMARK_SERVER_TOKEN;
  });
});
