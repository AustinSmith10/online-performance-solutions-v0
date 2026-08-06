# Real-time refresh for ops

Consultants and stakeholders currently need to manually refresh pages to see
new uploads, flags, approvals, and status changes. This plan makes the
relevant ops and portal pages live-update automatically.

## Decisions

- **Mechanism**: Supabase Realtime `postgres_changes` subscriptions
  (client-side, calling `router.refresh()` on relevant events) — the same
  pattern already used by `RealtimeProjectRefresher.tsx`. **Not** Postgres
  `LISTEN`/`NOTIFY` + SSE.
  - Considered LISTEN/NOTIFY + SSE (reusing the `DATABASE_URL` session-pooler
    connection already set up for pg-boss) as the zero-metering alternative.
    Rejected for now: at this team's scale we're well under Supabase's free
    tier (200 concurrent connections / 2M messages per month; Pro/Team
    overage is $10 per extra 1,000 connections and $2.50 per extra 1M
    messages), so the extra infrastructure isn't worth the tech debt yet.
    Revisit if usage scales up enough to approach those limits.
- **Existing pattern to generalize**: `app/(consultant)/ops/_components/RealtimeProjectRefresher.tsx`
  is a client component that opens `supabase.channel(...).on('postgres_changes', ...)`
  subscriptions and calls `router.refresh()`. It's hardcoded to the consultant
  workspace's own project list + notifications. It needs to become reusable —
  accepting a list of `{ table, filter, event }` subscriptions — so each page
  below can wire up exactly what it needs.
- **Portal scope**: the stakeholder-facing delivery tracker
  (`app/(client)/portal/projects/[id]/_components/DeliveryStepper.tsx`,
  from issue [#54](https://github.com/AustinSmith10/online-performance-solutions-v0/issues/54))
  is in scope for this round, not deferred.

## Vertical slices

### 1. Realtime refresh: ops project detail page (AFK)

Generalize `RealtimeProjectRefresher.tsx` into a reusable, parameterized
subscription component (accepts a list of table+filter subscriptions instead
of being hardcoded to the consultant workspace), and wire it into
`app/(consultant)/ops/projects/[id]/page.tsx`, subscribed to that specific
project's row plus its pbdb files, extraction flags, and approvals.

**Acceptance criteria**
- [x] `RealtimeProjectRefresher` (or its successor) accepts a list of
      `{ table, filter, event }` subscriptions as props, not hardcoded tables
- [x] Ops project detail page subscribes to: the project row itself, its
      pbdb files, extraction flags, and approvals — scoped to that project id
- [x] Opening the detail page in one tab and uploading/flagging/approving in
      another tab (or as a different actor) updates the first tab without a
      manual refresh
- [x] Subscription is cleaned up on unmount (no leaked channels)

**Blocked by**: None — can start immediately.

### 2. Realtime refresh: ops dashboard full coverage (AFK)

Using the generalized component from #1, audit and extend the ops list
page's existing subscription (`app/(consultant)/ops/page.tsx`) beyond
`assigned_consultant_id` project changes + notification inserts, to also
cover available/unassigned jobs and review-response changes.

**Acceptance criteria**
- [x] Ops dashboard subscribes to available/unassigned job changes (not just
      the consultant's own assigned projects)
- [x] Ops dashboard subscribes to review-response changes relevant to the
      consultant
- [x] Existing project-change and notification coverage is preserved
- [x] A new available job, or a review response landing, appears on the
      dashboard without a manual refresh

**Blocked by**: #1 (needs the generalized component).

### 3. Realtime refresh: stakeholder portal delivery tracker (AFK)

Wire the generalized refresher into the stakeholder portal's project page
(`app/(client)/portal/projects/[id]/page.tsx`), subscribed to the viewed
project's status/stage-relevant fields, so `DeliveryStepper.tsx` updates live
as the project moves through stages.

**Acceptance criteria**
- [x] Portal project page subscribes to the viewed project's row (status and
      any stage-relevant fields per `lib/delivery/stepper.ts`)
- [x] A status/stage change made elsewhere (e.g. by a consultant in ops)
      reflects on the open portal page without a manual refresh
- [x] Subscription is scoped to the single project the stakeholder is
      viewing, respecting existing portal access control

**Blocked by**: #1 (needs the generalized component).
