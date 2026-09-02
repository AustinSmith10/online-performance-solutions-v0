import { describe, expect, it } from "vitest";
import { isTransientFetchNoise, type ErrorShape } from "./transient-fetch-noise";

// mechanism.handled === false is how Sentry's global onerror/onunhandledrejection
// handlers tag an auto-capture; a Sentry.captureException(...) call leaves it true.
const unhandled = (over: Partial<ErrorShape>): ErrorShape => ({ handled: false, ...over });

describe("isTransientFetchNoise — DROPS genuine browser fetch-abort noise", () => {
  const nativeMessages = [
    "Load failed",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "The network connection was lost.",
    "The Internet connection appears to be offline.",
  ];

  for (const message of nativeMessages) {
    it(`drops unhandled TypeError: "${message}" (Error instance)`, () => {
      expect(isTransientFetchNoise(unhandled({ originalException: new TypeError(message) }))).toBe(true);
    });

    it(`drops unhandled TypeError: "${message}" (SDK-parsed, no originalException)`, () => {
      expect(
        isTransientFetchNoise(unhandled({ exceptionType: "TypeError", exceptionValue: message }))
      ).toBe(true);
    });
  }

  it("tolerates surrounding whitespace the SDK sometimes leaves on the value", () => {
    expect(
      isTransientFetchNoise(unhandled({ exceptionType: "TypeError", exceptionValue: "  Load failed  " }))
    ).toBe(true);
  });
});

describe("isTransientFetchNoise — KEEPS real errors", () => {
  it("keeps a handled capture even with an identical message (explicit captureException)", () => {
    expect(
      isTransientFetchNoise({ handled: true, originalException: new TypeError("Failed to fetch") })
    ).toBe(false);
  });

  it("keeps a capture with no mechanism info (handled undefined)", () => {
    expect(
      isTransientFetchNoise({ originalException: new TypeError("Failed to fetch") })
    ).toBe(false);
  });

  it("keeps an app-authored TypeError that merely contains a native phrase", () => {
    for (const message of [
      "Download failed: unsupported format", // contains "load failed"
      "Failed to fetch user profile: 500",
      "Upload failed to fetch presigned URL",
      "Load failed for template preview asset",
    ]) {
      expect(
        isTransientFetchNoise(unhandled({ originalException: new TypeError(message) }))
      ).toBe(false);
    }
  });

  it("keeps non-TypeError errors with the same message", () => {
    for (const type of ["AbortError", "DOMException", "Error", "NetworkError"]) {
      const e = new Error("Load failed");
      e.name = type;
      expect(isTransientFetchNoise(unhandled({ originalException: e }))).toBe(false);
      expect(
        isTransientFetchNoise(unhandled({ exceptionType: type, exceptionValue: "Load failed" }))
      ).toBe(false);
    }
  });

  it("keeps the classic real TypeError bugs", () => {
    for (const message of [
      "undefined is not an object (evaluating 'x.y')",
      "Cannot read properties of undefined (reading 'map')",
      "x is not a function",
      "Cannot destructure property 'foo' of 'bar' as it is null.",
    ]) {
      expect(
        isTransientFetchNoise(unhandled({ originalException: new TypeError(message) }))
      ).toBe(false);
    }
  });

  it("keeps a rejected string (no synthesized TypeError type)", () => {
    expect(isTransientFetchNoise(unhandled({ originalException: "Load failed" }))).toBe(false);
  });

  it("keeps an empty / missing message", () => {
    expect(isTransientFetchNoise(unhandled({ exceptionType: "TypeError", exceptionValue: "" }))).toBe(false);
    expect(isTransientFetchNoise(unhandled({ exceptionType: "TypeError" }))).toBe(false);
  });

  it("keeps a ChunkLoadError-style deploy-skew error", () => {
    const e = new Error("Loading chunk 42 failed.");
    e.name = "ChunkLoadError";
    expect(isTransientFetchNoise(unhandled({ originalException: e }))).toBe(false);
  });
});
