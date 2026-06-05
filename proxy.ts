import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { UserRole } from "@/types";

// Inlined to avoid importing lib/auth/session.ts which pulls in next/headers
const SESSION_EXPIRY_COOKIE = "ops-session-expires";

// Paths that bypass all auth checks
const PUBLIC_PATHS = [
  "/login",
  "/auth/confirm",
  "/api/auth/signout",
];

// Auth flow paths that require a valid session but skip TOTP/profile checks
const AUTH_FLOW_PATHS = ["/complete-profile", "/setup-2fa", "/verify-2fa"];

// Route prefix → required roles
const ROLE_ROUTES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/admin", roles: ["super_admin"] },
  { prefix: "/ops", roles: ["consultant", "super_admin"] },
  { prefix: "/portal", roles: ["client"] },
];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate and refresh the session on every request
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public paths bypass all checks
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // Redirect already-authenticated users away from login
    if (pathname === "/login" && user) {
      return NextResponse.redirect(
        new URL(portalForRole(user.app_metadata?.role as UserRole), request.url)
      );
    }
    return supabaseResponse;
  }

  // No session → redirect to login, preserving destination
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Enforce role-based session timeout via the custom expiry cookie set on login.
  // Treat a missing cookie the same as an expired one — the browser stopped sending
  // it because its Max-Age elapsed, meaning the custom session window is over.
  const expiresAt = request.cookies.get(SESSION_EXPIRY_COOKIE)?.value;
  if (!expiresAt || Date.now() > parseInt(expiresAt, 10)) {
    return NextResponse.redirect(new URL("/api/auth/signout", request.url));
  }

  // Auth flow paths (profile setup, 2FA) skip further checks
  if (AUTH_FLOW_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // Profile completeness check
  const profileComplete = user.user_metadata?.profile_complete === true;
  if (!profileComplete) {
    return NextResponse.redirect(new URL("/complete-profile", request.url));
  }

  // TOTP enforcement
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData) {
    if (aalData.nextLevel === "aal1") {
      // No TOTP enrolled — mandatory setup
      return NextResponse.redirect(new URL("/setup-2fa", request.url));
    }
    if (aalData.nextLevel === "aal2" && aalData.currentLevel === "aal1") {
      // TOTP enrolled but not verified this session
      const url = new URL("/verify-2fa", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  const userRole = user.app_metadata?.role as UserRole | undefined;

  // Root → redirect to role portal
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(portalForRole(userRole), request.url)
    );
  }

  // Block cross-portal access
  const route = ROLE_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (route && (!userRole || !route.roles.includes(userRole))) {
    return NextResponse.redirect(
      new URL(portalForRole(userRole), request.url)
    );
  }

  return supabaseResponse;
}

function portalForRole(role: UserRole | undefined): string {
  if (role === "super_admin") return "/admin";
  if (role === "consultant") return "/ops";
  return "/portal";
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
