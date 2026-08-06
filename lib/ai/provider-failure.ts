import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { renderEmailShell, e, paragraph, strong, noticeBox } from "@/lib/email/templates/shell";

export type AiProvider = "openai" | "anthropic";
export type AiFailureStatus = "quota_exceeded" | "rate_limited";

// Don't alert on every single failed call during a sustained outage — one
// email/notification per provider per hour is enough to get attention
// without flooding admins. Every failure still gets logged to
// ai_provider_failures regardless, so System Health always reflects the
// full picture even between alerts.
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/**
 * Distinguishes "this provider is out of credits / being rate-limited" from
 * an arbitrary one-off failure (malformed response, network blip, etc.) —
 * only the former is worth surfacing to admins. Duck-typed against the
 * OpenAI/Anthropic SDKs' thrown error shape rather than importing their
 * error classes, since both expose the same `status`/`code`/`error.type`
 * fields on their APIError.
 */
export function classifyProviderError(err: unknown): AiFailureStatus | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    status?: number;
    code?: string;
    type?: string;
    error?: { type?: string; code?: string };
    message?: string;
  };
  const code = e.code ?? e.error?.code ?? "";
  const type = e.type ?? e.error?.type ?? "";
  const message = (e.message ?? "").toLowerCase();

  if (
    code === "insufficient_quota" ||
    code === "credit_balance_exhausted" ||
    type === "insufficient_quota" ||
    message.includes("credit") ||
    message.includes("quota") ||
    message.includes("billing")
  ) {
    return "quota_exceeded";
  }
  if (e.status === 429) return "rate_limited";
  return null;
}

/**
 * Logs a classified provider failure and, unless the same provider already
 * alerted within the cooldown window, notifies every admin/super_admin —
 * both in-app (bell) and by email, via the existing notify() "system_error"
 * type (same one used for PBDR conversion failures, lib/documents/delivery.ts).
 * Never throws — a broken alerting path must not break extraction itself,
 * the same fail-open posture as the rest of this pipeline.
 */
export async function reportProviderFailure(opts: {
  provider: AiProvider;
  status: AiFailureStatus;
  context: string;
  error: unknown;
  projectId?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const errorMessage = opts.error instanceof Error ? opts.error.message : String(opts.error);

    const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
    const { count } = await supabase
      .from("ai_provider_failures")
      .select("id", { count: "exact", head: true })
      .eq("provider", opts.provider)
      .gte("created_at", cooldownSince);

    const { error: insertErr } = await supabase.from("ai_provider_failures").insert({
      provider: opts.provider,
      status: opts.status,
      context: opts.context,
      error: errorMessage.slice(0, 2000),
      project_id: opts.projectId ?? null,
    });
    if (insertErr) console.error("[provider-failure] failed to log row:", insertErr);

    if ((count ?? 0) > 0) return; // already alerted for this provider within the cooldown window

    const providerLabel = PROVIDER_LABEL[opts.provider];
    const statusLabel = opts.status === "quota_exceeded" ? "is out of credits" : "is being rate-limited";

    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .in("role", ["super_admin", "admin"]);

    const html = renderEmailShell({
      status: "error",
      statusLabel: "Action needed",
      heading: `${providerLabel} ${statusLabel}`,
      bodyHtml:
        paragraph(
          `${strong(providerLabel)} ${statusLabel} during ${e(opts.context)}. Document extraction and AI-judge verification may be returning empty or degraded results until this is resolved.`
        ) + noticeBox(e(errorMessage), "error"),
    });

    await Promise.all(
      (admins ?? []).map((u: { id: string }) =>
        notify({
          recipientId: u.id,
          type: "system_error",
          message: `${providerLabel} ${statusLabel} — document extraction may be degraded.`,
          emailSubject: `${providerLabel} ${opts.status === "quota_exceeded" ? "out of credits" : "rate limited"} — OPS`,
          emailHtml: html,
        }).catch((err) => console.error("[provider-failure] notify failed:", err))
      )
    );
  } catch (err) {
    console.error("[provider-failure] reportProviderFailure itself failed:", err);
  }
}
