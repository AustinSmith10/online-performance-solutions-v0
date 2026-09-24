# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Consultant (primary):** works a queue of assigned projects all day. Drafts and QA's the PBDB, dispatches it to third-party stakeholders for approval, handles rejections and revisions, then oversees the PBDR. Needs scan speed, one clear next action, and unmissable flag/revision state. Confirmed by the user 2026-09-24 for the consultant project page.
- **Admin:** supervises and intervenes; the admin project page reuses the consultant page composition (#197) with additive admin-only actions.
- **Stakeholder (internal, login user):** submits requests and downloads finished reports for their Client via a separate portal.
- **Third-party stakeholder (external):** approval reviewer, not a login user; acts only through tokenised links.

## Product Purpose

OPS ("Online Performance Solution", DDEG) shepherds an engineering **Performance Solution** report through drafting, consultant QA, third-party stakeholder approval and delivery. Success is projects moving through PBDB → stakeholder review → PBDR → delivered on time, with rejections, overdue work and extraction flags caught by the consultant before they reach a client.

## Operating Context

- Internal, data-dense workflow application (Operate mode), not a marketing surface.
- Glossary lives in `CONTEXT.md` (Client, Stakeholder internal/external, PBDB, PBDR). "Stakeholder" is an intentional umbrella term.
- Project page = header card (status, source, overdue, revision, dates, project number) + stage rail + "Right now" focus card in a left rail, and Details / Documents / Stakeholders reference tabs on the right; Audit trail is a second primary tab.
- Runs in a desktop browser for consultants and admins; mobile web is secondary.

- Consultant dashboard ("My projects", `app/(consultant)/ops`): the entry point. Summary tiles, a "Right now" banner for pending assignments and revisions/overdue, and four lists (Active, With stakeholders, Archive, Available jobs). Consultants accept or decline admin-pushed assignments inline and can self-assign available jobs.

## Capabilities and Constraints

- Next.js (breaking-changes version; see AGENTS.md), Tailwind v4, Supabase.
- Presentational work must not change data flow, server actions, the flag model, the delivery stepper logic, migrations or types.
- Status vocabulary: draft, submitted, assigned, in progress, awaiting approval (dispatched), revision required, converting to PBDR, delivered, complete, paused; plus overdue as an overlay.

## Product Principles

1. One next action: the "Right now" card outranks everything else on a project.
2. Colour means state: overdue, flagged, awaiting and delivered must stay distinguishable and rare enough to mean something.
3. Nothing consequential is hidden: flags, revision notes and audit history are reachable without hunting.
4. Dense but scannable: prefer compact rows and clear labels over decoration.

## Evidence on Hand

Real UAT projects in the dev database (e.g. 250011 Rev 2, Revision Required). No brand style guide, logo usage rules or testimonials exist in the repo; none are invented here.

## Accessibility & Inclusion

No product-specific standard has been stated. Working target for critique: WCAG 2.2 AA (contrast, keyboard, focus visibility, non-colour cues). Confirm with the user if a formal requirement exists.
