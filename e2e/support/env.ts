// Resolves the Supabase connection this E2E run is allowed to touch, and
// refuses to start if it looks like a real/shared database.
//
// Mirrors the one existing real-Postgres integration test in this repo
// (lib/payments/ledger.concurrency.test.ts): read SUPABASE_TEST_URL /
// SUPABASE_TEST_SERVICE_ROLE_KEY (set after `npx supabase start` +
// `npx supabase status -o env`, same as the CI "concurrency" job), falling
// back to the NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// NEXT_PUBLIC_SUPABASE_ANON_KEY a developer may already have exported.
//
// Deliberately NOT reading .env.local here — in this repo .env.local points
// at a real hosted Supabase project (see .env.example vs. the checked-in
// dev value), and these tests must never be able to touch it.

export interface LocalSupabaseEnv {
  url: string;
  serviceRoleKey: string;
  anonKey: string;
}

const LOCAL_HOST_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|host\.docker\.internal)(:\d+)?\/?$/i;

function assertLocal(url: string): void {
  if (!LOCAL_HOST_PATTERN.test(url)) {
    throw new Error(
      `[e2e] Refusing to run against non-local Supabase URL: "${url}".\n` +
        "These E2E tests must run against a local `npx supabase start` instance only.\n" +
        "Set SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY / SUPABASE_TEST_ANON_KEY " +
        "(via `npx supabase status -o env`) rather than pointing this at .env.local, " +
        "a shared UAT project, or production."
    );
  }
}

export function resolveLocalSupabaseEnv(): LocalSupabaseEnv {
  const url =
    process.env.SUPABASE_TEST_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:54321";

  assertLocal(url);

  const serviceRoleKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "[e2e] Missing SUPABASE_TEST_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY).\n" +
        "Run `npx supabase start` then `npx supabase status -o env` and export the " +
        "resulting SERVICE_ROLE_KEY / API_URL / ANON_KEY as SUPABASE_TEST_SERVICE_ROLE_KEY / " +
        "SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY before running the E2E suite."
    );
  }
  if (!anonKey) {
    throw new Error(
      "[e2e] Missing SUPABASE_TEST_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) — required so the " +
        "Next.js dev server under test can talk to the local Supabase instance."
    );
  }

  return { url, serviceRoleKey, anonKey };
}

export const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? "http://localhost:3000";

// Optional heavy dependencies. Tests that need them check this at runtime
// and skip (never fail flakily) when the dependency isn't reachable/configured
// — see e2e/support/optional-deps.ts.
export const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3001";
export const HAS_ANTHROPIC_KEY = Boolean(process.env.ANTHROPIC_API_KEY);
