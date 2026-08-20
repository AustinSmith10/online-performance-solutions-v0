import { defineConfig, devices } from "playwright/test";
import { resolveLocalSupabaseEnv, APP_URL } from "./e2e/support/env";

// Playwright E2E config (issue #155) — covers the core "drop everything"
// journey: client submits a project -> consultant assigns/reviews -> PBDB
// dispatched -> stakeholder approves -> PBDR delivered.
//
// SAFETY: this suite must only ever run against a local `npx supabase
// start` instance, never a real/shared database. See e2e/support/env.ts —
// resolveLocalSupabaseEnv() throws if the resolved URL isn't
// localhost/127.0.0.1, and that check runs both here (to configure the dev
// server under test) and again in e2e/global-setup.ts.
//
// One-time local setup, mirroring what the CI "concurrency" job does
// (.github/workflows/ci.yml) and vitest.concurrency.config.ts's real-Postgres
// tests (lib/payments/ledger.concurrency.test.ts):
//
//   npx supabase start
//   npx supabase status -o env | grep -E '^[A-Z_]+=' | sed 's/"//g'
//   # export the API_URL / ANON_KEY / SERVICE_ROLE_KEY values as:
//   export SUPABASE_TEST_URL=...
//   export SUPABASE_TEST_ANON_KEY=...
//   export SUPABASE_TEST_SERVICE_ROLE_KEY=...
//   npm run seed   # (with the same env — supabase/seed.ts reads
//                  #  NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY,
//                  #  so run it as e.g.
//                  #  NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_TEST_URL \
//                  #  SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_TEST_SERVICE_ROLE_KEY npm run seed)
//   npx playwright test
//
// A subset of specs additionally need a local Gotenberg instance
// (GOTENBERG_URL, docx->pdf conversion) and/or ANTHROPIC_API_KEY (AI field
// extraction on submission) to exercise those stages for real — they check
// for these at runtime (e2e/support/optional-deps.ts) and skip cleanly,
// rather than failing flakily, when they're not configured.
const supabaseEnv = resolveLocalSupabaseEnv();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Specs share one local database and mutate global-ish state (dispatch
  // gates, credit ledger) — running workers in parallel would race across
  // spec files. Keep this suite single-worker for determinism; individual
  // specs are already fast since each seeds its own project directly.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Force the dev server under test onto the local Supabase instance,
      // overriding whatever .env.local has (in this repo .env.local points
      // at a real hosted Supabase project — see .env.example for the local
      // default). Next.js's own .env.local loading never overrides
      // already-set process.env values, so these win.
      NEXT_PUBLIC_SUPABASE_URL: supabaseEnv.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.serviceRoleKey,
      NEXT_PUBLIC_APP_URL: APP_URL,
    },
  },
});
