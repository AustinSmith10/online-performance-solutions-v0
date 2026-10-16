import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Who an AI call is made on behalf of. Optional everywhere: usage logging and
// the Haiku daily-limit metering both simply skip when it's absent.
export interface AiCallContext {
  userId?: string | null;
  projectId?: string | null;
}

export interface AiTokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
}

/**
 * Logs one Anthropic call's token usage to ai_usage_events for the admin
 * usage view. Never throws and never blocks the caller: a logging failure
 * must not fail an extraction (same fail-open stance as the budget checks).
 */
export async function recordAiUsage(
  feature: string,
  model: string,
  usage: AiTokenUsage | undefined,
  ctx?: AiCallContext
): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("ai_usage_events")
      .insert({
        feature,
        model,
        input_tokens: usage?.input_tokens ?? 0,
        output_tokens: usage?.output_tokens ?? 0,
        user_id: ctx?.userId ?? null,
        project_id: ctx?.projectId ?? null,
      });
    if (error) console.error("[ai-usage] insert failed:", error.message);
  } catch (err) {
    console.error("[ai-usage] insert failed:", err);
  }
}
