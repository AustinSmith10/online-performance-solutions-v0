import { randomBytes, createHash } from "crypto";

// Re-implements the two pure primitives from lib/stakeholders/tokens.ts
// (generateTokenString / hashToken) instead of importing that module
// directly: lib/stakeholders/tokens.ts pulls in lib/supabase/admin.ts,
// which does `import "server-only"` — that package throws unconditionally
// as soon as it's required outside a Next.js server-component bundle, which
// is exactly the plain-Node context Playwright test files run in. Keep this
// in sync with lib/stakeholders/tokens.ts if the hashing scheme ever changes.

export function generateTokenString(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
