/**
 * Resets first-run tour state for the three seeded test accounts so their
 * onboarding flow (card + spotlight tour, or spotlight tour alone) shows
 * again on next login. All three roles now key off onboarding_steps_seen.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/uat/reset-onboarding-tours.ts
 */
import { createAdminClient } from "@/lib/supabase/admin";

const supabase = createAdminClient();

async function main() {
  const emails = ["stakeholder@ops.test", "consultant@ops.test", "admin@ops.test"];

  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, role")
    .in("email", emails);

  if (error) throw error;
  if (!users || users.length === 0) {
    console.log("No matching users found for", emails);
    return;
  }

  for (const user of users) {
    const { error: updateError } = await supabase
      .from("users")
      .update({
        onboarding_steps_seen: [],
      })
      .eq("id", user.id as string);

    if (updateError) {
      console.error(`Failed to reset ${user.email as string}:`, updateError.message);
    } else {
      console.log(`Reset onboarding state for ${user.email as string} (${user.role as string})`);
    }
  }
}

main().then(() => process.exit(0));
