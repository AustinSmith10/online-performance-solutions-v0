import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNeedsAttentionSignals } from "@/lib/admin/needs-attention";
import { trayId } from "@/lib/notifications/tray-id";
import type { TrayEntryKind } from "@/lib/notifications/tray";
import {
  jobGuidance,
  bounceGuidance,
  stalledProjectGuidance,
  pendingReviewGuidance,
  expiringTokenGuidance,
} from "@/lib/admin/error-guidance";
import { ResolveSignalButton } from "@/components/ResolveSignalButton";

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
  const dotColor =
    kind === "hard_error" ? "bg-red-600" : kind === "needs_attention" ? "bg-amber-600" : "bg-blue-600";

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          {title}
          <span className="text-xs font-normal text-zinc-400">({children.length})</span>
        </h2>
        <p className="mt-0.5 pl-4 text-xs text-zinc-500">{description}</p>
      </div>
      {children.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
          {emptyText}
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {children}
        </div>
      )}
    </section>
  );
}

function Row({
  signalId,
  message,
  guidance,
  timestamp,
  href,
}: {
  signalId: string;
  message: string;
  guidance: string;
  timestamp: string;
  href: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-800">{message}</p>
        <p className="mt-1 text-xs text-zinc-500">{guidance}</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-zinc-400">{formatDateTime(timestamp)}</span>
          {href && (
            <Link href={href} className="text-xs text-blue-600 hover:underline">
              View project →
            </Link>
          )}
        </div>
      </div>
      <ResolveSignalButton signalId={signalId} />
    </div>
  );
}

export default async function SystemHealthPage() {
  const { data } = await getNeedsAttentionSignals(createAdminClient());

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">System Health</h1>
        <p className="text-sm text-zinc-500">
          Everything currently flagged in the notification bell, with detail and suggested next
          steps. Mark an entry resolved once you&apos;ve dealt with it — it&apos;ll come back on
          its own if the underlying issue recurs.
        </p>
      </div>

      <Section
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

      <Section
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

      <Section
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

      <Section
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

      <Section
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
    </div>
  );
}
