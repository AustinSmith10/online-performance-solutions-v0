"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function markOnboardingStepSeen(stepId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("users")
    .select("onboarding_steps_seen")
    .eq("id", user.id)
    .single();

  const seen: string[] = profile?.onboarding_steps_seen ?? [];
  if (seen.includes(stepId)) return;

  await adminClient
    .from("users")
    .update({ onboarding_steps_seen: [...seen, stepId] })
    .eq("id", user.id);
}

export async function dismissClientOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const adminClient = createAdminClient();
  await adminClient
    .from("users")
    .update({ has_seen_client_onboarding: true })
    .eq("id", user.id);
}
