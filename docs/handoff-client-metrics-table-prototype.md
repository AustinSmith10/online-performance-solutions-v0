# Handoff: Client-Specific Metrics Table — Prototype

## Purpose of this session

Build a **working prototype** (not a finished feature, not an issue write-up) of a new admin/super-admin GUI feature so the user can click through it and validate the UX/data-model before it's finalized into a GitHub issue via `/to-issues`. Rough edges are fine — no production polish, no full test coverage, no migration rollback safety required. Real Supabase migrations should still be used since that's how this app already works.

**This is one item out of an 8-item Phase 1.5/2 plan currently being grilled/interviewed in a separate parent conversation.** The other 7 items (soft delete, audit tabs, a "needs attention" chit, global unsaved-changes rollout, consultant assignment-accept flow, stakeholder delivery tracking) are explicitly **out of scope** here — do not touch them, do not build them, do not let this prototype's changes bleed into those areas.

## First action: create a branch

Before writing any code, run:

```
git checkout -b prototype/client-metrics-table
```

(or a similarly descriptive name). Do not build this on `main` — the user was explicit about this.

## Background: how the existing hardcoded mechanism works today

There's a single hardcoded lookup table used for one specific client's workflow, which this feature needs to generalize:

- **Table**: `halcyon_developments` (defined in `supabase/migrations/00000000000011_project_files.sql`), columns: `dev_name`, `project_code`, `aep`, `trustee_entity`. It has **no `client_id` column** — it's global, not scoped per client.
- **Consumers**: queried in `app/actions/submission.ts` (primary logic), and the same lookup logic is duplicated in `app/(client)/portal/submit/resume/[id]/page.tsx` and referenced in `app/api/webhooks/email/route.ts`.
- **Three hardcoded token constants** (in `app/actions/submission.ts`):
  - `HALCYON_LOOKUP_TOKEN = "EXTRACT_DEV_NAME"` — extracted **normally by AI** from the client's submitted documents; its extracted value becomes the lookup/match key.
  - `TRUSTEE_TOKEN = "EXTRACT_TRUSTEE"` and `RAINFALL_TOKEN = "EXTRACT_RAINFALL_INTENSITY"` — these are **excluded from AI extraction** (see the `halcyonTokens` exclusion set at `app/actions/submission.ts:210`) and instead get their values filled in from the matched `halcyon_developments` row once the lookup key matches.
- **Matching logic**: case-insensitive exact match on `dev_name` first, falling back to substring match (both directions) if no exact match — see `app/actions/submission.ts` around line 240.

Template placeholder tokens themselves are managed elsewhere: `template_field_mappings` table, with an existing admin UI for mapping/picking tokens at `app/(admin)/admin/templates/[id]/_components/mapping-table.tsx`. Reuse that same token-picker UX pattern for this feature rather than inventing a new one — the user is already familiar with it.

## Decided design (confirmed by the user during the interview)

1. **Structured tables, not raw generic grids.** Each client can have one or more admin-configurable tables. Admin defines named + typed columns once per table (text/number/date), Excel upload matches spreadsheet headers into that structure, and there's a proper edit grid (add/remove rows) — not a freeform spreadsheet clone. This was chosen over a fully schema-less generic grid because it gives validation and a consistent, reusable UI regardless of what a given client's table actually contains.

2. **New tab on the Client details page.** Location: `app/(admin)/admin/clients/[id]/page.tsx`, which currently has tabs `overview`, `templates`, `users`, `danger`. Add a new tab here for managing these tables (list existing tables for the client, create new one, upload Excel, edit rows).

3. **Excel upload needs a new dependency.** No xlsx/sheetjs/exceljs library exists in `package.json` today — one will need to be added.

4. **Not reference-only — must wire into the resolver.** The user was explicit: this needs to functionally replace/generalize the hardcoded `halcyon_developments` mechanism above, not just be a passive display feature.

5. **Must be fully generic — nothing "development"-specific.** Direct quote from the user: *"it is not always specifically development"* — other clients' tables won't necessarily represent developments at all, so avoid hardcoding any development-flavored naming/semantics anywhere in the data model or UI copy.

6. **The resolver-linking model — 3 roles, opt-in per table:**
   - **(a) Opt-in flag.** Each table has a toggle: *"Use this table to auto-fill document fields."* Off by default — most tables are just plain reference/edit-only data with zero functional wiring into submissions.
   - **(b) Match token + match column.** If enabled, the admin picks one **match token** from that client's existing template placeholder tokens (via the same token-picker pattern as `mapping-table.tsx`). This token keeps being extracted by AI from submitted documents exactly as today — nothing changes about its extraction. The admin also picks which **table column** that token's extracted value should be compared against, using the same case-insensitive exact-then-substring matching logic that `dev_name` lookups use today.
   - **(c) Output token → column mappings.** The admin then adds one or more additional token → column pairs. Each such output token must be **automatically excluded from AI extraction** (generalizing the existing `halcyonTokens` exclusion-set pattern) and instead filled in from the matched row's value in that column at submission time.

   This model is a direct generalization of the existing hardcoded 3-token relationship (`EXTRACT_DEV_NAME` → match key, `EXTRACT_TRUSTEE`/`EXTRACT_RAINFALL_INTENSITY` → outputs) — same behavior, just config-driven instead of hardcoded constants. The user confirmed this model matches their needs after this exact relationship was explained back to them.

## Explicitly out of scope for this session

Do not implement, and do not let this prototype touch:
- Soft delete UI/logic for any entity (users, stakeholders, clients, templates)
- Audit tab changes (admin audit-tab permission change, or the new consultant project-level audit tab)
- The "needs attention" chit (combined error + accessibility alert panel)
- The global unsaved-changes-guard rollout
- The consultant assignment-accept-with-timer flow
- The stakeholder Amazon-Prime-style delivery tracking feature

One incidental note for context only, not to implement: client soft-delete (decided elsewhere in the same interview) will cascade to delete a client's templates/stakeholders/projects. This prototype shouldn't need to touch client deletion at all — just don't design anything here that would contradict that direction if it's ever touched.

## What "done" looks like for this prototype

The user wants to click through and validate the UX and data-model feel, then decide whether to refine this into a final GitHub issue via `/to-issues`. So the bar is: a real, running feature in the browser (create a table → define columns → upload Excel → see/edit rows → toggle "auto-fill" on → pick match token/column → add output token mappings) that demonstrates the concept end-to-end, not a mockup.

## Suggested skills for this session

- **`prototype`** — this task is explicitly a prototyping exercise; that skill likely encodes the right speed/quality tradeoffs for this kind of throwaway-but-functional build.
- **`run`** — use to launch the dev server and click through the feature in a real browser once built, per this project's own guidance (AGENTS.md/CLAUDE.md note this is a modified Next.js — check `node_modules/next/dist/docs/` before writing Next-specific code, since APIs/conventions may differ from training data).
- **`verify`** — once the flow is built, use this to confirm the create-table → upload → edit → auto-fill-mapping flow actually works end-to-end in the running app, not just that it compiles.
