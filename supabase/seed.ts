import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("Seeding OPS database...");

  // ── Client ─────────────────────────────────────────────────────────────────
  const { data: stockland, error: orgError } = await supabase
    .from("clients")
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

  if (orgError || !stockland) {
    console.error("Failed to upsert org:", orgError?.message);
    return;
  }
  console.log("Org ready:", stockland.name, stockland.id);

  // ── Remove stale real-domain accounts ──────────────────────────────────────
  const staleEmails = [
    "fire@ddeg.com.au",
    "consultant@ddeg.com.au",
    "client@stockland.com.au",
    "admin2@ddeg.com.au",
  ];
  const { data: allUsers } = await supabase.auth.admin.listUsers();
  for (const stale of staleEmails) {
    const match = allUsers?.users.find((u) => u.email === stale);
    if (match) {
      await supabase.auth.admin.deleteUser(match.id);
      console.log(`Removed stale user: ${stale}`);
    }
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  type UserSpec = {
    email: string;
    role: "super_admin" | "admin" | "consultant" | "stakeholder";
    firstName: string;
    lastName: string;
    clientId: string | null;
    availability?: "available" | "on_leave" | "at_capacity";
    totpExempt?: boolean;
  };

  const testUsers: UserSpec[] = [
    {
      email: "superadmin@ops.test",
      role: "super_admin",
      firstName: "Admin",
      lastName: "User",
      clientId: null,
    },
    {
      email: "admin@ops.test",
      role: "admin",
      firstName: "Ops",
      lastName: "Admin",
      clientId: null,
      totpExempt: true,
    },
    {
      email: "consultant@ops.test",
      role: "consultant",
      firstName: "Test",
      lastName: "Consultant",
      clientId: null,
      availability: "available",
      totpExempt: true,
    },
    {
      email: "stakeholder@ops.test",
      role: "stakeholder",
      firstName: "Sarah",
      lastName: "Whitmore",
      clientId: stockland.id,
      totpExempt: true,
    },
    {
      email: "Kymberly.m@ops.test",
      role: "admin",
      firstName: "Kymberly",
      lastName: "M",
      clientId: null,
      totpExempt: true,
    },
    {
      email: "Trishan.T@ops.test",
      role: "consultant",
      firstName: "Trishan",
      lastName: "T",
      clientId: null,
      availability: "available",
      totpExempt: true,
    },
    {
      email: "Hudson.s@ops.test",
      role: "consultant",
      firstName: "Hudson",
      lastName: "S",
      clientId: null,
      availability: "available",
      totpExempt: true,
    },
    {
      email: "Cedric.N@ops.test",
      role: "consultant",
      firstName: "Cedric",
      lastName: "N",
      clientId: null,
      availability: "available",
      totpExempt: true,
    },
    {
      email: "Nathan.P@ops.test",
      role: "consultant",
      firstName: "Nathan",
      lastName: "P",
      clientId: null,
      availability: "available",
      totpExempt: true,
    },
  ];

  const { data: existingAuth } = await supabase.auth.admin.listUsers();

  for (const u of testUsers) {
    // Lowercase is the canonical stored form for email (#169, migration
    // 00000000000128 CHECK). The UAT specs above keep their original
    // mixed-case spelling as documentation, but every write here normalises.
    const email = u.email.toLowerCase();
    const alreadyExists = existingAuth?.users.find((a) => a.email === email);

    let userId: string;

    if (alreadyExists) {
      console.log(`Auth user already exists: ${email}`);
      userId = alreadyExists.id;

      if (u.totpExempt && alreadyExists.app_metadata?.totp_exempt !== true) {
        await supabase.auth.admin.updateUserById(userId, {
          app_metadata: { ...alreadyExists.app_metadata, totp_exempt: true },
        });
        console.log(`  set totp_exempt for ${email}`);
      }
    } else {
      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email: email,
          password: "Ops@TestPass1!",
          email_confirm: true,
          app_metadata: {
            role: u.role,
            client_id: u.clientId,
            ...(u.totpExempt ? { totp_exempt: true } : {}),
          },
          user_metadata: { profile_complete: true },
        });

      if (authError || !authUser.user) {
        console.error(`Failed to create auth user ${email}:`, authError?.message);
        continue;
      }
      userId = authUser.user.id;
    }

    const { error: dbError } = await supabase.from("users").upsert(
      {
        id: userId,
        email: email,
        first_name: u.firstName,
        last_name: u.lastName,
        phone: "0400000000",
        company_role: u.role,
        state_territory: "NSW",
        role: u.role,
        client_id: u.clientId,
        availability: u.availability ?? "available",
        profile_complete: true,
        totp_enabled: false,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (dbError) {
      console.error(`Failed to upsert users row for ${email}:`, dbError.message);
    } else {
      console.log(`Ready: ${email} (${u.role})`);
    }
  }

  console.log("\nSeed complete. Password for all accounts: Ops@TestPass1!");
  console.log("Note: 2FA setup required on first login.\n");
  console.log("  superadmin@ops.test   — super_admin");
  console.log("  admin@ops.test        — admin");
  console.log("  consultant@ops.test   — consultant");
  console.log("  stakeholder@ops.test  — stakeholder (Stockland)");
  console.log("  Kymberly.m@ops.test   — admin (UAT)");
  console.log("  Trishan.T@ops.test    — consultant (UAT)");
  console.log("  Hudson.s@ops.test     — consultant (UAT)");
  console.log("  Cedric.N@ops.test     — consultant (UAT)");
  console.log("  Nathan.P@ops.test     — consultant (UAT)");
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
