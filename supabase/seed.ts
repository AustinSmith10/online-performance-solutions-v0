import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("Seeding OPS local database...");

  // TODO: Insert Stockland org once schema is defined (issue #3 onward)
  // const { data: org } = await supabase.from("organisations").insert({ name: "Stockland", slug: "stockland", ... }).select().single();

  // TODO: Insert test users once auth schema is in place (issue #3)
  // - super_admin: admin@ddeg.com.au
  // - consultant: consultant@ddeg.com.au
  // - client: client@stockland.com.au

  console.log("Seed complete (no-op until schema migrations land).");
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
