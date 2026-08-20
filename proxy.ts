import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { UserRole } from "@/types";

// Inlined to avoid importing lib/auth/session.ts which pulls in next/headers
const SESSION_EXPIRY_COOKIE = "ops-session-expires";

// Paths that bypass all auth checks
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/auth/confirm",
  "/auth/update-password",
  "/approve",
  "/api/auth/signout",
  "/api/webhooks/email",
  "/api/health",
];

// Auth flow paths that require a valid session but skip TOTP/profile checks
const AUTH_FLOW_PATHS = ["/complete-profile", "/setup-2fa"];

// Route prefix → required roles
const ROLE_ROUTES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/admin", roles: ["super_admin", "admin"] },
  { prefix: "/ops", roles: ["consultant", "super_admin", "admin"] },
  { prefix: "/portal", roles: ["stakeholder"] },
];

// Supabase host, derived once from the configured project URL, for use in
// connect-src/img-src CSP directives (REST/Storage over https, Realtime over wss).
const SUPABASE_HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;

// Builds the Content-Security-Policy-Report-Only header value for a single
// request, using a fresh per-request nonce for script-src.
//
// Report-only for now — see GitHub issue #158. Not yet wired to a report-to
// endpoint (tracked separately) and not yet flipped to enforcing (tracked
// separately). Expect a benign violation report on every PDF preview
// (pdf.js's worker/eval usage), which is fine to ignore for this pass.
function buildCspReportOnly(nonce: string): string {
  return [
    `script-src 'self' 'nonce-${nonce}'`,
    `worker-src 'self'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
    `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} blob:`,
    `font-src 'self'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64"
  );
  const cspReportOnly = buildCspReportOnly(nonce);

  // Applies the report-only CSP header to any response before it's returned,
  // so every exit path from this function — redirects, JSON errors, and the
  // pass-through response — carries the header.
  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set("Content-Security-Policy-Report-Only", cspReportOnly);
    return response;
  };

  let supabaseResponse = withCsp(NextResponse.next({ request }));

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
          supabaseResponse = withCsp(NextResponse.next({ request }));
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
      return withCsp(
        NextResponse.redirect(
          new URL(portalForRole(user.app_metadata?.role as UserRole), request.url)
        )
      );
    }
    return supabaseResponse;
  }

  const isApiRoute = pathname.startsWith("/api/");

  // No session → API routes get 401 JSON; pages redirect to login
  if (!user) {
    if (isApiRoute) {
      return withCsp(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withCsp(NextResponse.redirect(url));
  }

  // Auth flow paths (profile setup, 2FA) bypass the expiry check — invited users
  // arrive here without a session cookie and must be allowed through to complete setup.
  if (AUTH_FLOW_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // Enforce role-based session timeout via the custom expiry cookie set on login.
  // Treat a missing cookie the same as an expired one — Max-Age has elapsed.
  // API routes get 401 JSON; pages redirect to the signout handler.
  const expiresAt = request.cookies.get(SESSION_EXPIRY_COOKIE)?.value;
  if (!expiresAt || Date.now() > parseInt(expiresAt, 10)) {
    if (isApiRoute) {
      return withCsp(NextResponse.json({ error: "Session expired" }, { status: 401 }));
    }
    return withCsp(NextResponse.redirect(new URL("/api/auth/signout", request.url)));
  }

  // Profile completeness check
  const profileComplete = user.user_metadata?.profile_complete === true;
  if (!profileComplete) {
    if (isApiRoute) {
      return withCsp(
        NextResponse.json({ error: "Profile setup incomplete" }, { status: 403 })
      );
    }
    return withCsp(NextResponse.redirect(new URL("/complete-profile", request.url)));
  }

  // TOTP enrollment enforcement (skipped in development for easier local testing,
  // and for accounts explicitly flagged totp_exempt in app_metadata — used for
  // UAT test accounts so testers aren't stuck sharing a TOTP secret).
  // Only gates first-time setup — once a user has a verified TOTP factor
  // (nextLevel advances past "aal1"), later logins are password-only; there is
  // no per-session or per-device re-challenge.
  const totpExempt = user.app_metadata?.totp_exempt === true;
  if (process.env.NODE_ENV !== "development" && !totpExempt) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.nextLevel === "aal1") {
      if (isApiRoute) {
        return withCsp(NextResponse.json({ error: "2FA setup required" }, { status: 403 }));
      }
      return withCsp(NextResponse.redirect(new URL("/setup-2fa", request.url)));
    }
  }

  const userRole = user.app_metadata?.role as UserRole | undefined;

  // Root → redirect to role portal
  if (pathname === "/") {
    return withCsp(
      NextResponse.redirect(new URL(portalForRole(userRole), request.url))
    );
  }

  // Block cross-portal access (pages) / enforce role for API routes
  const route = ROLE_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (route && (!userRole || !route.roles.includes(userRole))) {
    if (isApiRoute) {
      return withCsp(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    return withCsp(
      NextResponse.redirect(new URL(portalForRole(userRole), request.url))
    );
  }

  return supabaseResponse;
}

function portalForRole(role: UserRole | undefined): string {
  if (role === "super_admin" || role === "admin") return "/admin";
  if (role === "consultant") return "/ops";
  return "/portal";
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
