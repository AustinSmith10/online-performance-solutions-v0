import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { addWorkingDays } from "@/lib/delivery/working-days";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import type { StakeholderReview } from "@/types";

const TOKEN_WORKING_DAYS = 5;

export function generateTokenString(): string {
  return randomBytes(32).toString("base64url");
}

// Lowercase hex, matching the Postgres backfill's encode(sha256(token::bytea), 'hex')
// exactly (#134/#159) — a token generated before this code shipped (hash computed
// by the SQL backfill) must validate identically to one generated after (hash
// computed here).
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function computeTokenExpiry(
  dispatchedAt: Date,
  stateTerritory: string | null
): Promise<Date> {
  const year = dispatchedAt.getUTCFullYear();
  const holidays = await getPublicHolidays(stateTerritory, year);
  return addWorkingDays(dispatchedAt, TOKEN_WORKING_DAYS, holidays);
}

// Unifies PBDB and PBDR signed-URL lifetimes to 14 business days (#161),
// holiday-aware via the same addWorkingDays/getPublicHolidays pattern as the
// approval token's own expiry above. Also fetches next year's holidays when
// the window could cross a year boundary (14 business days routinely spans
// the Dec/Jan public-holiday period) — computeTokenExpiry's single-year fetch
// is fine for its own shorter 5-day window but isn't safe to reuse verbatim
// here.
export const SIGNED_URL_BUSINESS_DAYS = 14;

export async function computeSignedUrlExpirySeconds(
  from: Date,
  stateTerritory: string | null,
  businessDays: number = SIGNED_URL_BUSINESS_DAYS
): Promise<number> {
  const startYear = from.getUTCFullYear();
  const endYear = new Date(from.getTime() + businessDays * 7 * 24 * 60 * 60 * 1000).getUTCFullYear();
  const years = startYear === endYear ? [startYear] : [startYear, endYear];
  const holidaySets = await Promise.all(years.map((year) => getPublicHolidays(stateTerritory, year)));
  const holidays = new Set(holidaySets.flatMap((set) => Array.from(set)));

  const expiresAt = addWorkingDays(from, businessDays, holidays);
  const seconds = Math.round((expiresAt.getTime() - from.getTime()) / 1000);
  return seconds;
}

export interface ValidatedToken {
  review: StakeholderReview;
  isExpired: boolean;
}

export async function validateToken(tokenString: string): Promise<ValidatedToken | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("stakeholder_reviews")
    .select("*")
    .eq("token_hash", hashToken(tokenString))
    .maybeSingle();

  if (error || !data) return null;

  const review = data as unknown as StakeholderReview;
  const isExpired = new Date(review.expires_at) < new Date();

  return { review, isExpired };
}
