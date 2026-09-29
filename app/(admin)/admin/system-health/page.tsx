import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNeedsAttentionSignals } from "@/lib/admin/needs-attention";
import { trayId } from "@/lib/notifications/tray-id";
import type { TrayEntryKind } from "@/lib/notifications/tray";
import {
  jobGuidance,
  bounceGuidance,
  emailSendFailureGuidance,
  aiProviderFailureGuidance,
  creditRaceEventGuidance,
  stalledProjectGuidance,
  pendingReviewGuidance,
  expiringTokenGuidance,
} from "@/lib/admin/error-guidance";
import { ResolveSignalButton } from "@/components/ResolveSignalButton";
import { ResolveEmailFailureButton } from "@/components/ResolveEmailFailureButton";
import { ResolveAiProviderFailureButton } from "@/components/ResolveAiProviderFailureButton";
import type { CreditRaceEvent } from "@/types";

const CREDIT_RACE_EVENT_LABEL: Record<CreditRaceEvent["event_type"], string> = {
  deduct_credit: "a credit deduction",
  debit_deferred: "a deferred debit",
  log_upfront: "an upfront payment log",
  log_override: "a payment override",
};

const PILL_LINK =
  "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Section({
  title,
  description,
  kind,
  emptyText,
  children,
}: {
  title: string;
  description: string;
  kind: TrayEntryKind;
  emptyText: string;
  children: React.ReactNode[];
}) {
  // A healthy section is one quiet line; a dot only appears when something is
  // actually flagged, so red/amber always means "look here".
  if (children.length === 0) {
    return (
      <section className="flex items-center gap-2 px-1 text-sm text-zinc-500">
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium text-zinc-700">{title}</span>
        <span className="text-xs">{emptyText}</span>
      </section>
    );
  }

  const dotColor = kind === "hard_error" ? "bg-red-600" : "bg-amber-600";

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotColor}`} />
          {title}
          <span className="text-xs font-normal tabular-nums text-zinc-500">({children.length})</span>
        </h2>
        <p className="mt-0.5 pl-4 text-xs text-zinc-500">{description}</p>
      </div>
      <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {children}
      </div>
    </section>
  );
}

function Row({
  signalId,
  message,
  guidance,
  timestamp,
  href,
  resolveButton,
}: {
  signalId?: string;
  message: string;
  guidance: string;
  timestamp: string;
  href: string | null;
  resolveButton?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-zinc-800">{message}</p>
        <p className="mt-1 text-xs text-zinc-500">{guidance}</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs tabular-nums text-zinc-500">{formatDateTime(timestamp)}</span>
          {href && (
            <Link href={href} className={PILL_LINK}>
              View project
            </Link>
          )}
        </div>
      </div>
      {resolveButton ?? (signalId && <ResolveSignalButton signalId={signalId} />)}
    </div>
  );
}

export default async function SystemHealthPage() {
  const { data, error } = await getNeedsAttentionSignals(createAdminClient());

  const sections = [
    { key: "failedJobs", count: data.failedJobs.length, hard: true, node: (
      <Section key="failedJobs"
        title="Failed jobs"
        description="Background jobs that ran and failed (recovery, expiry, PBDB/PBDR generation & delivery)."
        kind="hard_error"
        emptyText="No failed background jobs."
      >
        {data.failedJobs.map((job) => (
          <Row
            key={job.id}
            signalId={trayId.job(job.id)}
            message={`${job.name} failed${job.output?.message ? `: ${job.output.message}` : ""}${
              job.retry_limit > 0 ? ` (${job.retry_count}/${job.retry_limit} retries)` : ""
            }`}
            guidance={jobGuidance(job.name, job.output?.message ?? null)}
            timestamp={job.completed_on ?? job.created_on}
            href={
              typeof job.data?.projectId === "string"
                ? `/admin/projects/${job.data.projectId}`
                : null
            }
          />
        ))}
      </Section>
    ) },
    { key: "bounceEvents", count: data.bounceEvents.length, hard: true, node: (
      <Section key="bounceEvents"
        title="Email bounces"
        description="Outbound emails a recipient's mail server rejected."
        kind="hard_error"
        emptyText="No unresolved email bounces."
      >
        {data.bounceEvents.map((b) => (
          <Row
            key={b.id}
            signalId={trayId.bounce(b.id)}
            message={`Email bounced: ${b.email}${b.reason ? ` (${b.reason})` : ""}`}
            guidance={bounceGuidance(b.reason)}
            timestamp={b.created_at}
            href={b.project_id ? `/admin/projects/${b.project_id}` : null}
          />
        ))}
      </Section>
    ) },
    { key: "emailSendFailures", count: data.emailSendFailures.length, hard: true, node: (
      <Section key="emailSendFailures"
        title="Email send failures"
        description="Notification emails that never reached Postmark, or were rejected before sending. Also shown on the Dashboard's Email Failed card."
        kind="hard_error"
        emptyText="No unresolved email send failures."
      >
        {data.emailSendFailures.map((f) => (
          <Row
            key={f.id}
            message={`Email failed to send: ${f.to_email} (${f.source})${f.error ? ` — ${f.error}` : ""}`}
            guidance={emailSendFailureGuidance(f.source)}
            timestamp={f.created_at}
            href={f.project_id ? `/admin/projects/${f.project_id}` : null}
            resolveButton={<ResolveEmailFailureButton failureId={f.id} />}
          />
        ))}
      </Section>
    ) },
    { key: "aiProviderFailures", count: data.aiProviderFailures.length, hard: true, node: (
      <Section key="aiProviderFailures"
        title="AI provider failures"
        description="Anthropic calls that hit a billing or rate limit. Extraction carries on with empty or degraded results instead of blocking uploads."
        kind="hard_error"
        emptyText="No unresolved AI provider failures."
      >
        {data.aiProviderFailures.map((f) => (
          <Row
            key={f.id}
            message={`${f.provider === "anthropic" ? "Anthropic" : f.provider} ${
              f.status === "quota_exceeded" ? "is out of credits" : "is being rate-limited"
            } (during ${f.context})${f.error ? ` — ${f.error}` : ""}`}
            guidance={aiProviderFailureGuidance(f.provider, f.status)}
            timestamp={f.created_at}
            href={f.project_id ? `/admin/projects/${f.project_id}` : null}
            resolveButton={<ResolveAiProviderFailureButton failureId={f.id} />}
          />
        ))}
      </Section>
    ) },
    { key: "creditRaceEvents", count: data.creditRaceEvents.length, hard: true, node: (
      <Section key="creditRaceEvents"
        title="Credit race conditions caught"
        description="Duplicate dispatch/webhook attempts to bill the same project twice — caught and skipped, no double charge."
        kind="hard_error"
        emptyText="No credit race conditions caught."
      >
        {data.creditRaceEvents.map((c) => (
          <Row
            key={c.id}
            signalId={trayId.creditRace(c.id)}
            message={`Duplicate ${CREDIT_RACE_EVENT_LABEL[c.event_type]} attempt was caught and skipped`}
            guidance={creditRaceEventGuidance()}
            timestamp={c.detected_at}
            href={c.project_id ? `/admin/projects/${c.project_id}` : null}
          />
        ))}
      </Section>
    ) },
    { key: "stalledProjects", count: data.stalledProjects.length, hard: false, node: (
      <Section key="stalledProjects"
        title="Stalled projects"
        description="No update in 3+ days, with delivery due soon or overdue."
        kind="needs_attention"
        emptyText="No stalled projects."
      >
        {data.stalledProjects.map((p) => (
          <Row
            key={p.id}
            signalId={trayId.stalled(p.id)}
            message={`Project ${p.project_number ?? p.id} looks stalled (still ${p.status.replace(/_/g, " ")})`}
            guidance={stalledProjectGuidance()}
            timestamp={p.updated_at}
            href={`/admin/projects/${p.id}`}
          />
        ))}
      </Section>
    ) },
    { key: "pendingReviews", count: data.pendingReviews.length, hard: false, node: (
      <Section key="pendingReviews"
        title="Pending stakeholder reviews"
        description="Sent an approval request 3+ days ago with no response yet."
        kind="needs_attention"
        emptyText="No stakeholder reviews overdue."
      >
        {data.pendingReviews.map((r) => (
          <Row
            key={r.id}
            signalId={trayId.pending(r.id)}
            message={`${r.stakeholder_name} hasn't responded to their review request`}
            guidance={pendingReviewGuidance()}
            timestamp={r.dispatched_at}
            href={`/admin/projects/${r.project_id}`}
          />
        ))}
      </Section>
    ) },
    { key: "expiringTokens", count: data.expiringTokens.length, hard: false, node: (
      <Section key="expiringTokens"
        title="Expiring approval tokens"
        description="Approval links set to expire within 24 hours."
        kind="needs_attention"
        emptyText="No approval tokens expiring soon."
      >
        {data.expiringTokens.map((r) => (
          <Row
            key={r.id}
            signalId={trayId.expiring(r.id)}
            message={`Approval link for ${r.stakeholder_name} expires soon`}
            guidance={expiringTokenGuidance()}
            timestamp={r.expires_at}
            href={`/admin/projects/${r.project_id}`}
          />
        ))}
      </Section>
    ) },
  ];
  const flagged = sections.filter((x) => x.count > 0);
  const hardCount = flagged.filter((x) => x.hard).reduce((n, x) => n + x.count, 0);
  const attentionCount = flagged.filter((x) => !x.hard).reduce((n, x) => n + x.count, 0);
  // Flagged sections first (original order kept), healthy ones collapse below.
  const ordered = [...flagged, ...sections.filter((x) => x.count === 0)];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">System Health</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Everything currently flagged in the notification bell, with suggested next steps. Mark an
          entry resolved once you&apos;ve dealt with it. It comes back on its own if the issue recurs.
        </p>
        {process.env.SENTRY_ISSUES_URL && (
          <p className="mt-2 text-xs text-zinc-500">
            This page is the resolve workflow for known operational failures. For the full stream
            of unexpected errors and their stack traces:{" "}
            <a
              href={process.env.SENTRY_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={PILL_LINK}
            >
              Open the error stream in Sentry
            </a>
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Some health signals couldn&apos;t be loaded.</p>
          <p className="mt-1 text-xs text-red-700">
            The sections below may be incomplete, so an empty section here doesn&apos;t mean it&apos;s
            healthy. Reload the page, and check Sentry if it keeps happening.
          </p>
          <p className="mt-1 break-words text-xs text-red-700">{error}</p>
        </div>
      )}

      <p
        role="status"
        className={`rounded-lg px-4 py-3 text-sm font-medium tabular-nums ${
          flagged.length === 0 && !error
            ? "bg-green-50 text-green-800"
            : flagged.length === 0
              ? "bg-zinc-100 text-zinc-700"
              : hardCount > 0
                ? "bg-red-50 text-red-800"
                : "bg-amber-50 text-amber-800"
        }`}
      >
        {flagged.length === 0
          ? error
            ? "Nothing flagged in what loaded."
            : "All clear. Nothing needs attention."
          : [
              hardCount > 0 ? `${hardCount} error${hardCount === 1 ? "" : "s"}` : null,
              attentionCount > 0 ? `${attentionCount} need${attentionCount === 1 ? "s" : ""} attention` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>

      {ordered.map((x) => x.node)}
    </div>
  );
}
