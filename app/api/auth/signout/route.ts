import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SESSION_EXPIRY_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/login";

  const supabase = await createClient();
  await supabase.auth.signOut();

  const loginUrl = new URL("/login", request.url);
  if (next !== "/login") {
    loginUrl.searchParams.set("next", next);
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_EXPIRY_COOKIE);
  return response;
}
