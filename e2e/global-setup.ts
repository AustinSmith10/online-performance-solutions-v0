import { resolveLocalSupabaseEnv } from "./support/env";
import { requireSeedFixtures } from "./support/seed";
import { adminClient } from "./support/supabase";

/**
 * Runs once before the whole suite (see playwright.config.ts's globalSetup).
 * Two jobs:
 *   1. Refuse to proceed unless the Supabase connection is local (see
 *      env.ts's assertLocal) — the hard safety requirement from issue #155.
 *   2. Fail fast, with actionable instructions, if the local instance
 *      hasn't been seeded yet, instead of letting every spec fail
 *      individually with a confusing "user not found" error.
 */
export default async function globalSetup(): Promise<void> {
  resolveLocalSupabaseEnv();
  await requireSeedFixtures(adminClient());
}
