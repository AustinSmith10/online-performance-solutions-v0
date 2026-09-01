import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SESSION_EXPIRY_COOKIE } from "@/lib/auth/session";
import { isSafeRedirectPath } from "@/lib/http/safe-redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawNext = searchParams.get("next");
  const next = isSafeRedirectPath(rawNext) ? (rawNext as string) : "/login";
  const reason = searchParams.get("reason");

  const supabase = await createClient();
  await supabase.auth.signOut();

  const loginUrl = new URL("/login", request.url);
  if (next !== "/login") {
    loginUrl.searchParams.set("next", next);
  }
  // proxy.ts sends reason=expired when a session times out — surface it as a
  // plain-language notice on the login page (#177).
  if (reason === "expired") {
    loginUrl.searchParams.set("notice", "signed-out");
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_EXPIRY_COOKIE);
  return response;
}
