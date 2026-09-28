---
target: app/(admin)/admin home-profile group (page.tsx, dashboard, profile)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/ddeg/Desktop/online-performance-solution-v0/app/(admin)/admin home-profile group (page.tsx, dashboard, profile)"
timestamp: 2026-09-28T02-07-36Z
slug: profile-group-page-tsx-dashboard-profile-704fb66c
---
Method: dual-agent (A: ab28bd3a4b23ec47b · B: a956e894168a9af1f)

# Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Pending labels good; "Done" auto-closes at 2.2s with a silent refresh; no `aria-current` on the admin sidebar. |
| 2 | Match System / Real World | 2 | "Sys Error", raw project UUIDs shown instead of project numbers, "Buffer fired". |
| 3 | User Control and Freedom | 2 | Escape in a nested Waive confirmation closes both modals; "Mark resolved" has no undo; filters/presets aren't in the URL. |
| 4 | Consistency and Standards | 1 | `truncate` on an inline span never truncates; OverduePill has no day count (consultant pages show "Overdue · 6d"); 11px pills below the 12px floor. |
| 5 | Error Prevention | 3 | Waive is well-guarded (toggle → reason ≥10 chars → "cannot be undone"); "Mark resolved" is unguarded. |
| 6 | Recognition Rather Than Recall | 2 | Left-edge urgency colours (amber/blue/purple) have no legend or text equivalent. |
| 7 | Flexibility and Efficiency | 2 | Saved views and search exist, but no keyboard shortcuts, no bulk-resolve for duplicate system errors, drag-reorder is mouse-only. |
| 8 | Aesthetic and Minimalist Design | 2 | Overdue tile and "Overdue" preset show the same 6 rows twice; red is used so often (tiles + every row edge + pill) it stops signaling. |
| 9 | Error Recovery | 2 | Good recovery copy for email failures, but 3 identical error rows aren't grouped; red-400 timestamps are low-contrast. |
| 10 | Help and Documentation | 2 | Replayable tour exists; no inline explanation of row colour coding. |
| **Total** | | **20/40** | **Acceptable band (50%)** |

# Design Specificity Verdict

**LLM assessment:** Mostly generic admin-dashboard shell wrapped around some genuinely OPS-specific parts. The Active Projects list (`ReviewTallyChip`, "Flagged doc" chips, OverduePill, the three-step Waive flow with a written reason and an irreversibility warning) is clearly authored for this product's review workflow. But the page frame — "Dashboard" title, a grid of equal-weight coloured alert tiles, generic preset/filter/search chrome, a centered modal — reads as category-interchangeable. Most materially, it doesn't carry over the product's own signature pattern: DESIGN.md calls "Right now" the visual anchor of every other screen (consultant dashboard, stakeholder portal, project pages), but the admin home replaces it with six equal-weight tiles and no ranking, which is a direct miss against Product Principle 1 ("One next action").

**Deterministic scan:** `impeccable detect --json` on the three target paths returned exit code 2, 5 findings (1 warning, 4 advisory), all reached via the dashboard route:
- `side-tab` warning at `ActiveProjectsList.tsx:152` (`border-l-4`) — judged a **likely false positive**: the border color is state-keyed (overdue/unassigned/awaiting/override), not decorative, so it's a legitimate status affordance, not "AI slop."
- 4× `design-system-font-size` advisories for `text-[11px]` pills at `ActionPanel.tsx:949` and `ActiveProjectsList.tsx:164/168/175` — real: DESIGN.md sets 12px as the content-text floor.
`app/(admin)/admin/page.tsx` and `admin/profile` produced no static findings (page.tsx is a thin redirect to dashboard).

**Visual overlays:** injection succeeded via the bundled live-server. Console reported 4 anti-patterns on `/admin/dashboard` (3× low-contrast text at 2.5-2.6:1 using `#9f9fa9`, likely `zinc-400`/`zinc-500` meta text, against a 4.5:1 requirement; 1× "overused fontPrimary: geist 100%" — a **false positive** for a single-typeface admin tool by design) and 2 on `/admin/profile` (1× the same low-contrast signature, 1× the same font false positive). The low-contrast finding corroborates Assessment A's independent citation of `zinc-400` section headings, sub-headings and help text throughout both pages.

# Overall Impression

The Active Projects list and the review/waive machinery are genuinely well-made and specific to OPS's workflow — this is where the product's design language actually shows up. But the page around it is a generic "grid of alert tiles" dashboard that ignores the product's own signature pattern (Right now), duplicates the same overdue projects in two places, and drifts from DESIGN.md's own colour and type rules (zinc-400 for informational text, 11px pills, an added orange tone, purple reused for two different meanings). The single biggest opportunity: replace the six equal-weight tiles with one ranked "Right now" banner, the same pattern already proven on the consultant and stakeholder dashboards, so the busiest role in the product gets the same one-next-action clarity everyone else gets.

# What's Working

1. **State honesty in the project list.** `ReviewTallyChip` ("1 rejected · 1 pending") and `resolveStaffStatus` derive stage from one source of truth, so a mixed-outcome review round is visible at a glance — this directly serves Product Principle 3 ("nothing consequential is hidden").
2. **The Waive flow.** Toggle → written reason (≥10 chars) → an explicit "cannot be undone" warning is exactly the right amount of friction for an irreversible, audited admin action (Error Prevention score of 3, the best of the ten).
3. **Action tiles keep everything visible rather than acting on the first item.** "Review (N)" opens a per-item picker, and email-failure counts report the true total even past the 20-row display cap.

# Priority Issues

**[P1] Mobile row layout breaks: titles are covered, not truncated**
- **What:** `ActiveProjectsList.tsx:155` applies `truncate` to an inline `<span>`, which does nothing; at 375px the project title runs underneath the status-pill cluster (`shrink-0`) instead of eliding. Confirmed live by both assessments independently — Assessment B saw address text overlapping the "Overdue"/"In Progress" pills; Assessment A saw specific rows (221204, 221083) lose their title entirely.
- **Why it matters:** the project identifier is the one thing every row must show; this is broken on the one device class (phone) admins use to triage on the go.
- **Fix:** change to `block truncate` (or `min-w-0` + `truncate` on a block element), and stack the pill cluster under the meta line below `sm` instead of competing for the same row.
- **Suggested command:** `/impeccable adapt`

**[P1] The always-mounted modal strands focus and loses context on nested Escape**
- **What:** `Drawer.tsx:62-80` keeps `role="dialog" aria-modal="true"` in the DOM when closed, hidden only via opacity/pointer-events (not `inert`/`aria-hidden`); focus is left on the hidden element after close, Tab isn't trapped, and the Escape listener is attached to `document` (`:26`), so pressing Escape inside the Waive confirmation closes the parent modal too, discarding the whole in-progress stakeholder action.
- **Why it matters:** this is a real accessibility failure (screen-reader/keyboard users stranded on a hidden node) and a data-loss risk during an irreversible admin flow.
- **Fix:** unmount or `inert` the dialog when closed, give it an accessible name, trap Tab while open, return focus to the trigger on close, and stop Escape from propagating past the topmost open modal.
- **Suggested command:** `/impeccable harden`

**[P1] The Action section duplicates the list below it and hides a category**
- **What:** the Overdue tile's expanded list is the same 6 rows as both the "Overdue (6)" filter preset and, in the current seed data, the entire Active list. Separately, `page.tsx:169-171` excludes overdue projects from the "unassigned" filter, so two unassigned-and-overdue submissions (221662, 219713) never surface a "New Submission" tile. No ranking exists across the six tiles.
- **Why it matters:** the busiest role sees the same work triple-counted while a real category ("needs a consultant") is silently swallowed by "late" — a direct miss against Product Principle 1 ("One next action outranks everything").
- **Fix:** replace the tile grid with one ranked "Right now" banner (the pattern DESIGN.md already documents for the consultant and stakeholder dashboards), make categories overlap-aware ("2 unassigned, both overdue"), and have each tile filter the list below rather than repeat it inline.
- **Suggested command:** `/impeccable distill`

**[P2] Colour and type drift from the product's own DESIGN.md rules**
- **What:** informational text throughout both pages (section headings, "All projects →", modal sub-headings, password rules, sidebar footer, help text) uses `zinc-400` (~2.6:1 on white) — confirmed independently by the live low-contrast detector (2.5-2.6:1 against a 4.5:1 requirement) and by direct source citation. Status pills are 11px, under DESIGN.md's stated 12px floor. An orange tone is introduced alongside amber (DESIGN.md has one warning family), and purple is used for "Override" while DESIGN.md reserves purple for "in progress/converting."
- **Why it matters:** these are the product's own written rules (Never-Colour-Alone, Colour-Is-State, 12px floor), not house style being second-guessed — and the contrast failures are also WCAG AA violations.
- **Fix:** move flagged text to zinc-500 or darker, raise pills to 12px, fold orange into amber, and give Override a non-purple treatment (amber, per DESIGN.md's own note: "Override amber").
- **Suggested command:** `/impeccable polish` (colour specifics via `/impeccable colorize`)

**[P2] Profile form inputs have no programmatic labels**
- **What:** `Field` in `ProfileForm.tsx:354-368` renders a `<label>` with no `htmlFor`, paired with an input with no `id` — confirmed live: all 8 inputs had `labels.length === 0`, including both password fields. The dashboard's project-number field has the same gap.
- **Why it matters:** screen readers announce these as unnamed "edit text" controls, and clicking the label text does nothing.
- **Fix:** have `Field` generate an id (`useId`) and wire it to `htmlFor`/`id`, or nest the input inside the `<label>`.
- **Suggested command:** `/impeccable harden`

# Persona Red Flags

**Alex (Power User):** Saved-view reordering is mouse-drag only with no keyboard equivalent; filters/presets/search live only in component state (not the URL), so nothing is bookmarkable and everything resets on refresh — unlike the consultant dashboard, which does put state in the URL; there's no bulk "resolve all" for three identical duplicate system-error entries; saved views live in `localStorage` so they don't follow the admin to another machine.

**Sam (Accessibility-Dependent):** The hidden-but-mounted dialog strands focus with no Tab trap (detailed above); all profile and the project-number inputs are unlabelled; preset pills expose no `aria-pressed` (0 found in the DOM), so the selected state is colour-only; the saved-view delete control is a `<span role="button">` nested inside a real `<button>` — invalid nesting with no keyboard handler; expand/collapse toggles use "▼/▲" glyphs instead of `aria-expanded`.

**Riley (Stress Tester):** System errors are silently capped at `limit(10)` with no "showing 10 of N" (email failures do show their true count past the display cap, so this is an inconsistency, not a universal gap); the success "Done" modal auto-closes at 2.2s while `router.refresh()` is still running, and live realtime updates can reorder rows under the cursor mid-action (the notification badge changed 39→37 during the session); the Filters popover is a fixed `w-[22rem]` anchored `left-0`, which overflows at 375px.

# Minor Observations

- `document.title` is static ("OPS | Online Performance Solution") on every admin route, so browser tabs are indistinguishable.
- No `loading.tsx`/`error.tsx` for dashboard or profile, though DESIGN.md documents route-level skeletons as standard.
- The two empty-list states use different radii (`rounded-lg` vs `rounded-xl`) and neither offers a next action.
- "Retry PBDR conversion" (a recovery action) is styled as a destructive red button.
- On `/admin/profile` at 375px, the "Change password" button label wraps to two lines inside its border (Assessment B, live).
- The admin sidebar has no active/current-page indicator at all (`aria-current` exists only on the tab bar, not sidebar nav).

# Questions to Consider

1. The consultant and stakeholder dashboards both earn a single ranked "Right now" banner. Why does the role supervising everyone else get six unranked, equal-weight tiles instead?
2. If every in-flight project in this data is overdue, does painting every row's left edge red still mean anything, or does Overdue need an age breakdown (1-3d / 4-7d / 7d+) instead of a flat colour?
3. `/admin/projects` already exists as the full project list — is the Active Projects block on the home page earning its space as a filtered duplicate, or should that space show something no other page does (consultant load, stage throughput, reviews about to expire)?
