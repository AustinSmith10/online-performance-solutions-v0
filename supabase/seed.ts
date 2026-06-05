import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("Seeding OPS database...");

  // ── Seed test org ──────────────────────────────────────────────────────────
  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .upsert(
      {
        name: "Stockland",
        slug: "stockland",
        payment_method: "credit_deduction",
        credit_balance: 100,
        delivery_working_days: 5,
        state_territory: "NSW",
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (orgError) {
    console.error("Failed to upsert org:", orgError.message);
    return;
  }
  console.log("Org ready:", org.name, org.id);

  // ── Seed users ─────────────────────────────────────────────────────────────
  // Clean up any previously seeded real-domain accounts
  const staleEmails = [
    "fire@ddeg.com.au",
    "consultant@ddeg.com.au",
    "client@stockland.com.au",
  ];
  const { data: allUsers } = await supabase.auth.admin.listUsers();
  for (const stale of staleEmails) {
    const match = allUsers?.users.find((u) => u.email === stale);
    if (match) {
      await supabase.auth.admin.deleteUser(match.id);
      console.log(`Removed stale user: ${stale}`);
    }
  }

  const testUsers = [
    {
      email: "admin@ops.test",
      role: "super_admin" as const,
      firstName: "Admin",
      lastName: "User",
      orgId: null,
    },
    {
      email: "consultant@ops.test",
      role: "consultant" as const,
      firstName: "Test",
      lastName: "Consultant",
      orgId: null,
    },
    {
      email: "client@ops.test",
      role: "client" as const,
      firstName: "Test",
      lastName: "Client",
      orgId: org.id,
    },
  ];

  for (const u of testUsers) {
    // Check if auth user already exists
    const { data: existing } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.users.find((a) => a.email === u.email);

    let userId: string;

    if (alreadyExists) {
      console.log(`Auth user already exists: ${u.email}`);
      userId = alreadyExists.id;
    } else {
      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email: u.email,
          password: "Ops@TestPass1!",
          email_confirm: true,
          app_metadata: { role: u.role, org_id: u.orgId },
          user_metadata: { profile_complete: true },
        });

      if (authError || !authUser.user) {
        console.error(`Failed to create auth user ${u.email}:`, authError?.message);
        continue;
      }
      userId = authUser.user.id;
    }

    // Upsert public users row
    const { error: dbError } = await supabase.from("users").upsert(
      {
        id: userId,
        email: u.email,
        first_name: u.firstName,
        last_name: u.lastName,
        phone: "0400000000",
        company_role: u.role,
        state_territory: "NSW",
        role: u.role,
        org_id: u.orgId,
        profile_complete: true,
        totp_enabled: false,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (dbError) {
      console.error(`Failed to upsert users row for ${u.email}:`, dbError.message);
    } else {
      console.log(`Ready: ${u.email} (${u.role})`);
    }
  }

  console.log("\nSeed complete.");
  console.log("Login at http://localhost:3000/login");
  console.log("  admin@ops.test      → Super Admin");
  console.log("  consultant@ops.test → Consultant");
  console.log("  client@ops.test     → Client");
  console.log("Password for all accounts: Ops@TestPass1!");
  console.log("Note: 2FA setup required on first login.");
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
