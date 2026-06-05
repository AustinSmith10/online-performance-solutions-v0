/**
 * Seeds sample notifications for the first super_admin user found in the DB.
 * Run with: npx tsx --env-file=.env.local scripts/seed-notifications.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email")
    .eq("role", "super_admin")
    .limit(1)
    .single();

  if (error || !user) {
    console.error("No super_admin found:", error?.message);
    process.exit(1);
  }

  console.log(`Seeding notifications for ${user.email} (${user.id})`);

  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  const notifications = [
    {
      recipient_id: user.id,
      type: "project_submitted",
      message: "New project submitted by Stockland — OPS-2026-042. Assign a consultant to proceed.",
      is_read: false,
      created_at: minsAgo(3),
    },
    {
      recipient_id: user.id,
      type: "low_credit",
      message: "Stockland's credit balance has dropped to 1. Top up required before next submission.",
      is_read: false,
      created_at: minsAgo(47),
    },
    {
      recipient_id: user.id,
      type: "acknowledgement",
      message: "Submission acknowledged — OPS-2026-041. Expected delivery: 10 Jun 2026.",
      is_read: true,
      created_at: minsAgo(180),
    },
    {
      recipient_id: user.id,
      type: "modifications_requested",
      message: "Stakeholder requested modifications on OPS-2026-039. Review comments and update the report.",
      is_read: true,
      created_at: minsAgo(1440),
    },
    {
      recipient_id: user.id,
      type: "pbdr_delivery",
      message: "PBDR delivered to client for OPS-2026-038. 1 credit deducted from Stockland.",
      is_read: true,
      created_at: minsAgo(2880),
    },
  ];

  const { error: insertError } = await supabase.from("notifications").insert(notifications);

  if (insertError) {
    console.error("Insert failed:", insertError.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${notifications.length} notifications`);
}

main();
