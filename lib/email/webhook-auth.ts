import "server-only";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Verifies Basic Auth on an inbound Postmark webhook against a pair of env
 * vars. In non-production with no credentials configured, auth is skipped
 * (dev convenience) — production always requires both to be set.
 */
export function isPostmarkWebhookAuthorized(
  req: NextRequest,
  userEnvVar: string,
  passwordEnvVar: string,
  logLabel: string
): boolean {
  const user = process.env[userEnvVar];
  const password = process.env[passwordEnvVar];
  if (!user || !password) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[${logLabel}] ${userEnvVar}/${passwordEnvVar} not set in production — rejecting request`);
      return false;
    }
    console.warn(`[${logLabel}] ${userEnvVar}/${passwordEnvVar} not set — skipping auth check (dev only)`);
    return true;
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return false;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }

  const expected = `${user}:${password}`;
  const a = Buffer.from(decoded);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
