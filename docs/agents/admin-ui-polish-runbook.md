# Admin portal UI polish — runbook

A new session should follow this file top to bottom, one group at a time,
looping until all groups are done. **Every phase below is mandatory.** Two
groups already shipped with Phases 2 and 3 skipped and had to be redone; do
not repeat that. The review gate at the end of each group is the whole point.

## Status

| # | Group | State |
|---|-------|-------|
| 1 | home-profile | Done. #214 (critique fixes) and #215 (taste, motion, Emil, mobile-native) merged. |
| 2 | projects | Done. PR #216 merged. |
| 3 | clients | Done. Landed on `main` as direct commits (no PR): layout, taste, motion, details, review fixes. |
| 4 | people | Done. Direct commits on `main`: taste, motion, details, review fixes. |
| 5 | credits-templates | Done. Direct commits on `main`: taste, motion, details, mobile, review fixes. |
| 6 | ops-system | Done. Pushed to `main` at `6d13a54` on 2026-09-30, CI green. Includes approved behaviour changes (see "Approved exceptions"). |

Status last checked 2026-09-30 against `git log origin/main` and `gh pr list`.
For groups 3-5 the only evidence is the commit history; whether each ran its
review gate and the `review` skill is not recorded. Never assume this table is
current; check `git log origin/main` and `gh pr list` first.

Behaviour changes found in other groups by the whole-admin review (2026-09-30)
and **kept, recorded here as approved exceptions**: sorts start in their natural
direction (text A-Z, numbers and dates high-to-low; credits, templates,
consultants); confirm steps before removing a file requirement or extraction
token and a Drawer confirm for Freeze; up/down reorder buttons alongside drag;
the dashboard "Right now" urgency ranking; the tray and refresh shell changes.
Two regressions from those groups were fixed instead: a consultant's stored
client stays visible and clearable on the user page, and the shared Drawer
focuses its first form field on open (what `autoFocus` gave the dialogs it
replaced).

Open follow-ups after all six groups:

- `DESIGN.md` now documents the ops-system patterns (done 2026-09-30).
- A whole-admin `review` pass (run 2026-09-30, see its report) covers what the
  per-group reviews could not.
- Perf outliers still unprofiled: dashboard, projects, audit (220KB), and the
  email-queue / recovery pages send more data than they show.
- Email queue items assessed but not built: auto-filing verified live-token
  stakeholder replies (a policy decision), grouping repeat replies, suggested
  reply intent, and a scheduled reminder for unanswered clarifications.

## Ground rules (apply to every group, every phase)

- Styling, layout, copy, motion and platform-layer (meta/CSS) changes only.
  Never change data flow, server actions, RBAC/permission checks, the flag
  model, the delivery stepper logic, or any migrations/types.
  **Approved exceptions:** the user may explicitly approve a specific behaviour
  change during a group's Phase 1 (ops-system did: undo window, auto-advance,
  bulk restore, type-to-confirm, error banner, and later the email-queue
  improvements). Each exception must be listed by name in the review-gate
  message, kept to what was approved, covered by tests, and given to the
  `review` Spec agent as an allowed exception. Anything not on that list is
  still out of scope.
- One branch per group: `ui-polish-admin-<group-name>` off an up-to-date
  `main`.
- **Use your own git worktree** (`git worktree add ../ops-wt-<group> -b
  ui-polish-admin-<group> origin/main`, or the EnterWorktree tool) and run the
  dev server from it. This repo is often worked on by several sessions at
  once; in a shared checkout another session's `git checkout` silently moves
  your branch and its commits land on yours (this happened twice, and needed
  cherry-picks and a reset to untangle). Before every commit, run
  `git branch --show-current` and `git log --oneline origin/main..HEAD` and
  confirm you only see your own commits. Never push a branch you haven't
  checked this way.
- Read `AGENTS.md` first (Next.js conventions may differ from training data).
- The dev database is a **hosted Supabase project**, not a local one. Never
  let a test action commit (approve, reject, purge, resolve) against seed data;
  block the server-action request in the page to exercise timers and error
  paths instead. Cookies are shared across localhost ports, so a worktree dev
  server on another port stays signed in. Turbopack rejects a `node_modules`
  symlink pointing outside the worktree: run `npm ci` in each worktree.
- Verify every change in the browser pane via `preview_start` (or navigate to
  the already-running dev server), signed in as the admin role. Don't just
  eyeball the diff. The seeded admin is `admin@ops.test` (password in
  `supabase/seed.ts`); the session expires often, so expect to re-login.
- `DESIGN.md` at the repo root is the design system. Read and extend it, don't
  re-derive the direction.
- Keep commits small, one per screen where practical. Commit trailer:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (use whatever
  attribution the session's system reminder specifies).
- When a shared component (`ProjectWorkspace`, `StageRail`, `SettingsPill`,
  `MobileNav`, `NavLinks`, `SubmissionForm`, `ReviewTallyChip`, `Drawer`,
  `BackLink`) is the right place to fix something, fix it there and say so in
  the review-gate message; it also affects the consultant/client screens.
- Before "fixing" something that looks like duplication or a mistake, read
  the code comment next to it. Example: the Delete card in the project rail
  and the old one in Project Config were flagged as a duplicate, but the rail
  card is the deliberate fix for issue #177. Intentional design stays.
- Before proposing an animation, check `app/globals.css` for an existing
  class. This app already has `pane-in`, `rise-in`, `modal-backdrop`,
  `modal-panel`, `popover-br`, `rail-fill` and the `press` / `press-subtle`
  utilities. Most "missing motion" findings are an existing class that was
  never applied. Also `grep` the element's whole className before claiming it
  has no transition (a template-literal prefix often already has one).

## Groups, in order

1. **home-profile**: `admin/page.tsx`, `admin/dashboard`, `admin/profile`
2. **projects**: `admin/projects`, `admin/projects/[id]`, `admin/projects/submit`
3. **clients**: `admin/clients`, `admin/clients/[id]`, `admin/clients/new`
4. **people**: `admin/consultants`, `admin/stakeholders`, `admin/users`,
   `admin/users/[id]`, `admin/users/invite`
5. **credits-templates**: `admin/credits`, `admin/credits/[id]`,
   `admin/templates`, `admin/templates/[id]`, `admin/templates/upload`,
   `admin/templates/[id]/file-requirements/[reqId]`
6. **ops-system**: `admin/audit`, `admin/email-queue`, `admin/recovery`,
   `admin/settings`, `admin/system-health`

All paths are under `app/(admin)/admin/`.

## Established decisions (don't relitigate)

- **Links/actions that read as body text become filled pills**, not
  underlined text and not bordered buttons: `rounded-full bg-zinc-100 px-2 py-0.5
  text-xs font-medium text-zinc-700 transition-colors duration-150
  hover:bg-zinc-200 hover:text-zinc-900`. Drop a trailing `→` on those pills
  (redundant). Back links use the shared `components/BackLink.tsx` and keep
  their leading `←`. No always-on or dotted underlines anywhere.
- Colour is state only; one warning family (amber). Override is amber (not
  purple); purple is in-progress/converting only. Pause is amber, Delete red.
- Text-input font size stays 14px on desktop and is 16px on touch, via the
  `PLATFORM` class string (see Phase 3c). No `text-[10px]`/`text-[11px]`.
- Informational text is `zinc-500` or darker, never `zinc-400`.
- Radii: page-level white cards `rounded-xl`, tinted callouts `rounded-lg`,
  controls `rounded-md`, pills `rounded-full`. No bare `rounded`.
- Dates, revision numbers and counts use `tabular-nums`.
- Notification tray/toasts are owned by the global-nav work
  (`ui-polish-global-navigation`), not this runbook.
- Client-portal back links ("← My Reports") are intentionally not yet
  converted to `BackLink`; do them only if asked.

## Per-group loop

For the current group, run these phases in order. `<GROUP>` and `<ROUTES>`
are from the table above. **Phases 0-5 are all required. Do not merge phases,
do not jump from Phase 1 to Phase 4, and do not treat Phase 2/3 as optional
because Phase 1 "already fixed the important things".** They repeatedly find
real issues Phase 1 misses (whole classes: unanimated dialogs, off-scale
radii, missing focus rings, missing touch fixes).

Keep a checklist in your first message for the group and tick each phase off
in the review-gate message:

- [ ] Phase 0 setup
- [ ] Phase 1 impeccable critique + approved fixes
- [ ] Phase 2 taste pass (`redesign-existing-projects`)
- [ ] Phase 3a `find-animation-opportunities`
- [ ] Phase 3b `animate`
- [ ] Phase 3c `emil-design-eng`
- [ ] Phase 3d `mobile-native`
- [ ] Phase 4 closing checks + `review`
- [ ] Phase 5 review gate message

### Phase 0: setup

Create your worktree and branch off `origin/main` (see Ground rules), start or
find the dev server, sign in as admin, and open each target route once to
confirm it loads. Read `AGENTS.md` and `DESIGN.md`.

### Phase 1: Impeccable (direction + audit)

Invoke the `impeccable` skill in critique mode on `<ROUTES>`:

```
Critique-only mode (no code changes yet). This is OPS's admin/superadmin
portal, an internal data-dense operational console, not a marketing site.
DESIGN.md exists at the repo root; apply it rather than re-deriving. Critique
<ROUTES> against it: hierarchy, density, table/list patterns, empty/loading/
error states, admin-specific states (bulk actions, destructive
confirmations). Use the browser pane on the live screens signed in as admin.
Produce a ranked list of material fixes and stop for my approval.
```

The skill runs two isolated sub-agents (design review and detector/browser
evidence); let it. Present the report, then ask which issue first and how
much scope. Wait for approval, then implement the approved fixes in ranked
order, one small commit per screen where practical, verifying each in the
browser. Read the code comments around anything you're about to remove.

### Phase 2: taste pass (mandatory)

Invoke the `redesign-existing-projects` skill on `<ROUTES>`:

```
Target routes: <ROUTES>. Constraints: keep DESIGN.md's tokens and direction;
this is an internal admin console, so no landing-page patterns, no hero-scale
type, no decorative gradients, bias toward dense scannable tables and clear
status/severity indicators. Audit for generic AI-looking patterns (card-in-
card nesting, weak type scale, uneven spacing, inconsistent radii/shadows).
Propose changes first; do not apply anything that conflicts with DESIGN.md.
Wait for my approval, then apply.
```

Most of that skill's checklist is marketing-site advice and does not apply;
filter hard and report only what is really present. Useful greps:
bare `rounded`, `text-[10px]`/`text-[11px]`, `zinc-400` on informational text,
missing `tabular-nums` on counts/dates, missing `focus-visible` on links and
pills, tinted callouts vs plain cards using the wrong radius. Get approval,
apply, verify in the browser, commit.

### Phase 3: Emil's pack (mandatory, four steps)

**3a. `find-animation-opportunities`** on `<ROUTES>`, read-only. Propose only
motion with a purpose (row expand/collapse, status transitions, save/confirm
feedback, confirmation dialogs, popovers); reject decorative motion; use
exact durations/easings from `app/globals.css` and DESIGN.md; note
reduced-motion. Include a "rejected candidates" list. Show the shortlist and
wait for approval. Verify each claim against the actual className and
`app/globals.css` before presenting it.

**3b. `animate`** to implement the approved shortlist using only existing
classes/utilities (add none unless there is truly no equivalent). Confirm in
the browser (computed `animation`/`transition`) that each took effect.

**3c. `emil-design-eng`** for details: press/hover/focus states, tabular
numbers in tables and counters, clear disabled/loading states on admin action
buttons. Sweep every `fixed inset-0` dialog in the group's components for
missing `modal-backdrop`/`modal-panel`.

**Do not invoke `review-animations` yourself.** The skill cannot be run by
the assistant. Say it was skipped, and offer that the user can run
`/review-animations` themselves; continue without it if they decline.

**3d. `mobile-native`** at 375x812 (`resize_window` preset `mobile`; reset to
`desktop` afterwards). Fix native-feel bugs only, don't redesign dense
tables. Shared shell facts to check before changing anything:

- The client layout already has a `PLATFORM` Tailwind class string (no tap
  flash, `touch-manipulation`, `select-none` on buttons, 16px inputs on
  `pointer:coarse`). Extend that pattern; a plain-CSS version in
  `globals.css` did not compile reliably through Tailwind's layers.
- Root `app/layout.tsx` has the `viewport` export (`viewport-fit=cover`,
  single `theme-color`; the app has no working dark theme, so no
  `prefers-color-scheme` pair). Admin layout uses `min-h-dvh`, safe-area
  padding, and the PLATFORM class. If these are already on `main`, verify
  them in the browser rather than redoing them.
- Verify: search/inputs compute to 16px on touch, 14px on desktop.

### Phase 4: closing check

Run `npx tsc --noEmit -p .`, `npx eslint` on touched files, and
`npx vitest run` (all must pass). Confirm `git diff --stat origin/main..HEAD`
shows only component/styling/motion/copy files (no server actions, no
`supabase/migrations`, no `types/`). Then invoke the `review` skill against
`main` (it spawns Standards and Spec sub-agents; give the Spec agent this
runbook plus the list of approved fixes, since there is no issue). Fix
anything real; report the rest. Do not push yet.

The `review` must cover **every commit that will be pushed**. If more work is
added after it ran (extra behaviour changes, a follow-up feature, a perf
pass), run it again on the new commits and re-run the design detector.
`origin/main` moves under you when several sessions share the repo, so diff
with the merge-base (`git diff <base>...HEAD`), never `origin/main..HEAD`.

Design-hook findings: triage each. Functional status-coded left accents
(`border-l-4` keyed to state) are false positives; persist them with
`impeccable hooks ignore-value side-tab "*" --file <path> --reason "..."` and
mention it. Some rules (e.g. `gray-on-color`) can't be value-scoped; leave
those unsuppressed rather than ignoring a whole file, and say so.

### Phase 5: review gate (mandatory, do not skip)

Stop and hand control back to the user. Do not open a PR, push, or start the
next group on your own. Post a message that:

1. Names the group and the branch, and shows the phase checklist ticked
   (say explicitly which steps were skipped and why, e.g. `review-animations`).
2. Lists exactly what changed, screen by screen, in plain language (not a
   diff dump), flagging any change to shared components.
3. Gives a concrete "what to look for in the browser" checklist per screen:
   hover/focus/press states, loading/error/empty states, destructive-action
   confirmations, dialog/popover motion, table density at different row
   counts, and the 375px view.
4. Notes anything deliberately left alone and why.
5. Asks the user to review and confirm before anything is pushed.

Wait for the go-ahead. Then:

- Confirm with the user whether it goes via PR (default) or straight to
  `main`. Push the branch and open a PR against `main`.
- Wait for CI. Don't poll: use the PR monitor; it only wakes you on failure
  or conflict, so ask the user to tell you when checks are green, then merge.
  Auto-merge is not enabled on this repo.
- If `main` moved and the PR conflicts, `git fetch origin main` and *merge*
  `FETCH_HEAD` into your branch (no rebase, no force-push), resolve keeping
  both sides' intent, re-run the checks, push.
- Only after it is merged, start the next group's Phase 0 from the updated
  `main`. Groups that touch the same shared files must be merged one at a
  time, not in parallel.

## Loop termination

All six groups are done as of 2026-09-30 (ops-system merged at `6d13a54`). The
runbook's group loop is complete; don't look for a seventh group. Remaining
work is the follow-up list under Status.
