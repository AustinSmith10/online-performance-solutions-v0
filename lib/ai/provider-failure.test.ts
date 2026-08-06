import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyProviderError } from "./provider-failure";

describe("classifyProviderError — distinguishing quota/rate-limit failures from one-off errors", () => {
  it("classifies OpenAI's insufficient_quota error as quota_exceeded", () => {
    const err = {
      status: 429,
      code: "credit_balance_exhausted",
      type: "insufficient_quota",
      message: "You have no credits remaining. Add credits to continue using the API.",
    };
    expect(classifyProviderError(err)).toBe("quota_exceeded");
  });

  it("classifies a message mentioning credit/quota/billing as quota_exceeded even without a matching code", () => {
    expect(classifyProviderError({ status: 400, message: "Your credit balance is too low to access the API." })).toBe(
      "quota_exceeded"
    );
    expect(classifyProviderError({ message: "quota exceeded for this billing period" })).toBe("quota_exceeded");
  });

  it("classifies a plain 429 with no quota-shaped message as rate_limited", () => {
    expect(classifyProviderError({ status: 429, message: "Too many requests" })).toBe("rate_limited");
  });

  it("returns null for a non-quota, non-429 error (e.g. malformed request, network blip)", () => {
    expect(classifyProviderError({ status: 400, message: "Invalid JSON body" })).toBeNull();
    expect(classifyProviderError(new Error("fetch failed"))).toBeNull();
  });

  it("returns null for non-object / nullish input", () => {
    expect(classifyProviderError(null)).toBeNull();
    expect(classifyProviderError(undefined)).toBeNull();
    expect(classifyProviderError("some string error")).toBeNull();
  });

  it("reads nested error.type/error.code shapes (Anthropic-style)", () => {
    expect(classifyProviderError({ status: 400, error: { type: "insufficient_quota" } })).toBe("quota_exceeded");
    expect(classifyProviderError({ error: { code: "insufficient_quota" } })).toBe("quota_exceeded");
  });
});
