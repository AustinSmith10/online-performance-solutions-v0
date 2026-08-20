import "server-only";
import pino from "pino";

// Structured logger with redaction. Starting point for AUDIT.md #10 — this
// covers the specific PII-leaking call sites that finding named; the
// remaining ~100+ unstructured console.* calls in the repo are a larger,
// separate sweep, deliberately not part of this pass.
export const logger = pino({
  redact: {
    paths: [
      "email",
      "*.email",
      "*.Email",
      "stakeholderEmail",
      "newEmail",
      "payload.Email",
      "payload.*.Email",
    ],
    censor: "[REDACTED]",
  },
});
