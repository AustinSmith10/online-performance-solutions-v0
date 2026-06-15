# Handoff: Client-Facing Status Layer

## Context

This session explored the project status model in `online-performance-solution-v0` to understand what statuses clients see in the portal.

## What Was Found

### Current Status Model

There is a **single global `ProjectStatus` enum** — no separation between internal workflow states and client-facing labels. The same 9 statuses are stored in the DB and rendered verbatim in the client portal.

**Defined in:**
- `types/index.ts` — TypeScript type `ProjectStatus`
- `supabase/migrations/00000000000005_projects.sql` — DB CHECK constraint

**Statuses:**

| Status | Client label | Badge colour | Notes |
|---|---|---|---|
| `draft` | Draft | Grey | Not yet submitted |
| `submitted` | Submitted | Blue | Received, pending assignment |
| `assigned` | Assigned | Yellow | Consultant allocated |
| `in_review` | In review | Purple | Being worked on |
| `qa` | QA | Purple | Internal QA — same purple as `in_review` |
| `approved` | Approved | Green | Passed internal approval |
| `dispatched` | Dispatched | Green | Triggers "Awaiting your acknowledgement" tray |
| `delivered` | Delivered | Green | Terminal |
| `complete` | Complete | Grey | Terminal |

**Client portal files rendering statuses:**
- `app/(client)/portal/page.tsx` — list view with `STATUS_LABELS` + `STATUS_CLASSES` maps
- `app/(client)/portal/projects/[id]/page.tsx` — detail view, same maps

### Identified Gap

Internal workflow statuses (`assigned`, `in_review`, `qa`, `approved`) are meaningless to clients — they expose implementation detail about the consultant pipeline. The `qa` and `in_review` statuses even share the same badge colour, suggesting the UI already conflates them.

## Proposed Next Step

Design a **client-facing status layer** that maps internal statuses to simpler client labels, e.g.:

| Internal statuses | Client-visible label |
|---|---|
| `draft` | Draft |
| `submitted` | Received |
| `assigned`, `in_review`, `qa`, `approved` | In progress |
| `dispatched` | Awaiting acknowledgement |
| `delivered` | Delivered |
| `complete` | Complete |

Implementation options:
1. **Thin mapping layer** — a `CLIENT_STATUS_LABELS` map in the portal pages only (no DB change, zero risk)
2. **Separate DB column** — `client_status` field that advances independently (more flexible, more complex)

Option 1 is the lowest-risk path and keeps the internal pipeline intact.

## Suggested Skills

- `/design-an-interface` — to explore multiple shapes for the client status layer before committing to one
- `/grill-me` — to stress-test the mapping design (e.g. should `dispatched` use a different label given the acknowledgement CTA?)
- `/to-issues` — to file the implementation as a GitHub issue once the design is settled
