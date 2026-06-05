import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("Seeding OPS local database...");

  // Seed Stockland org
  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .insert({
      name: "Stockland",
      slug: "stockland",
      payment_method: "credit_deduction",
      credit_balance: 100,
      delivery_timeline_days: 5,
    })
    .select()
    .single();

  if (orgError) {
    console.error("Failed to insert org:", orgError.message);
    return;
  }

  // Seed test users via Supabase Auth admin API (invite flow)
  const testUsers = [
    { email: "admin@ddeg.com.au", role: "super_admin" as const },
    { email: "consultant@ddeg.com.au", role: "consultant" as const },
    { email: "client@stockland.com.au", role: "client" as const },
  ];

  for (const u of testUsers) {
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email: u.email,
        password: "Ops@TestPass1!",
        email_confirm: true,
        app_metadata: { role: u.role, org_id: org.id },
        user_metadata: { profile_complete: true },
      });

    if (authError) {
      console.error(`Failed to create ${u.email}:`, authError.message);
      continue;
    }

    await supabase.from("users").insert({
      id: authUser.user.id,
      email: u.email,
      first_name: u.role === "super_admin" ? "Admin" : u.role === "consultant" ? "Test" : "Client",
      last_name: "User",
      phone: "0400000000",
      company_role: u.role,
      state_territory: "NSW",
      role: u.role,
      org_id: org.id,
      profile_complete: true,
      invited_at: new Date().toISOString(),
    });

    console.log(`Created ${u.email}`);
  }

  console.log("Seed complete.");
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
