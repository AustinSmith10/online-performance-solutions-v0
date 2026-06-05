import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// TODO (issue #3): replace stub with real Supabase session check via @supabase/ssr
// TODO (issue #3): enforce role-based gating — /admin/* → super_admin, /ops/* → consultant|super_admin, /portal/* → client

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals.
     * Auth + role gating will be applied here once Supabase auth is wired up.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
