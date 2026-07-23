import { createHmac, timingSafeEqual } from "crypto";

// "Remember this device" — lets a user skip the 2FA challenge on subsequent
// logins from the same browser for TRUSTED_DEVICE_MAX_AGE. Kept free of
// next/headers so it can be imported from both proxy.ts (Node runtime,
// request/response cookies) and server actions (next/headers cookies).
export const TRUSTED_DEVICE_COOKIE = "ops-trusted-device";
export const TRUSTED_DEVICE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, in seconds

function secret(): string {
  const value = process.env.TRUSTED_DEVICE_SECRET;
  if (!value) {
    throw new Error("TRUSTED_DEVICE_SECRET is not set");
  }
  return value;
}

export function signTrustedDeviceToken(userId: string, version: number): string {
  const expiresAt = Date.now() + TRUSTED_DEVICE_MAX_AGE * 1000;
  const payload = `${userId}.${version}.${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyTrustedDeviceToken(
  token: string | undefined,
  userId: string,
  version: number
): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [tokenUserId, tokenVersionRaw, expiresAtRaw, signature] = parts;

  if (tokenUserId !== userId) return false;
  if (parseInt(tokenVersionRaw, 10) !== version) return false;

  const expiresAt = parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const payload = `${tokenUserId}.${tokenVersionRaw}.${expiresAtRaw}`;
  const expectedSignature = createHmac("sha256", secret()).update(payload).digest("hex");

  const signatureBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (signatureBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(signatureBuf, expectedBuf);
}
