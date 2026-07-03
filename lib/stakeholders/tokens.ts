import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { addWorkingDays } from "@/lib/delivery/working-days";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import type { StakeholderReview } from "@/types";

const TOKEN_WORKING_DAYS = 5;

export function generateTokenString(): string {
  return randomBytes(32).toString("base64url");
}

export async function computeTokenExpiry(
  dispatchedAt: Date,
  stateTerritory: string | null
): Promise<Date> {
  const year = dispatchedAt.getUTCFullYear();
  const holidays = await getPublicHolidays(stateTerritory, year);
  return addWorkingDays(dispatchedAt, TOKEN_WORKING_DAYS, holidays);
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
    .eq("token", tokenString)
    .maybeSingle();

  if (error || !data) return null;

  const review = data as unknown as StakeholderReview;
  const isExpired = new Date(review.expires_at) < new Date();

  return { review, isExpired };
}
