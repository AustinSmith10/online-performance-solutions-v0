// Test accounts seeded by supabase/seed.ts — reused here rather than
// inventing new fixtures (per issue #155). Run `npm run seed` (pointed at a
// local `npx supabase start` instance — see e2e/support/env.ts) before
// running this suite; e2e/global-setup.ts checks these exist and fails fast
// with instructions if they don't.
//
// All seeded accounts share one password (see supabase/seed.ts's final
// console.log) and are all `totp_exempt: true` except superadmin@ops.test,
// so 2FA enrollment never blocks these logins.

export const SEED_PASSWORD = "Ops@TestPass1!";

export const ACCOUNTS = {
  admin: { email: "admin@ops.test", password: SEED_PASSWORD, homePath: "/admin/dashboard" },
  consultant: { email: "consultant@ops.test", password: SEED_PASSWORD, homePath: "/ops" },
  stakeholder: { email: "stakeholder@ops.test", password: SEED_PASSWORD, homePath: "/portal" },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;
