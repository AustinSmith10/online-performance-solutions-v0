---
target: app/(admin)/admin/projects group (list, [id], submit)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/ddeg/Desktop/online-performance-solution-v0/app/(admin)/admin/projects group (list, [id], submit)"
timestamp: 2026-09-28T06-13-49Z
slug: app-admin-admin-projects-group-list-id-submit
---
Method: dual-agent (A: aad0e90c6d2847b20 · B: a1130732ba42de5d3)

# Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Stage rail/Right Now are strong, but on revision-required projects the overdue banner (keyed off stored `project.status`) contradicts the header pill and Right Now card (keyed off `effectiveStatus`). |
| 2 | Match System / Real World | 2 | Audit trail shows raw extraction tokens; the admin submit flow shows client-voice copy ("Awaiting your review", "Attach your documents on the left"). |
| 3 | User Control and Freedom | 3 | 30-day recovery bin and Cancel on every confirm; but override/pause/revert modals have no Escape key and no focus trap. |
| 4 | Consistency and Standards | 2 | Override is purple on the list but amber in the header; card radii vary (`rounded-lg`/`rounded-md`/`rounded`); zinc-400 informational text still present in this group. |
| 5 | Error Prevention | 3 | Override/revert/pause all require a written reason, but override's 10-char minimum has no counter or hint — the button just stays disabled. |
| 6 | Recognition Rather Than Recall | 2 | List rows omit due date despite it being a sort option; payment gate and delivery timing sit behind a floating popover, detached from context. |
| 7 | Flexibility and Efficiency | 1 | No bulk actions, no pagination (loads every project), search needs a button click, no keyboard affordances. |
| 8 | Aesthetic and Minimalist Design | 2 | PO number and client name each repeat 2-3×; overdue is signalled four different ways on one screen; the awaiting-approval Right Now card holds ~8 controls. |
| 9 | Error Recovery | 2 | Recovery messaging is good in isolated components, but the empty state ("No projects match your filters") doesn't name which filters, and Delete's inline confirm gets visually clipped. |
| 10 | Help and Documentation | 2 | Help is hover-only `title` tooltips (useless on touch/keyboard), and one is stale: the project-number tooltip still says numbers "aren't unique across projects," which migration 135 made untrue. |
| **Total** | | **21/40** | **Acceptable (52%)** |

# Design Specificity Verdict

**LLM assessment:** Mostly authored for OPS at its core — the shared stage rail, the urgency-tinted Right Now card, review-round tallies ("1 rejected · 1 pending"), and PBDB/PBDR version grouping are all genuinely product-specific, and the admin rail's "Number & consultant" swap for "Project number" (matching the admin-only setup step) without changing the rail's length is a thoughtful adaptation. But the admin *layer* on top has drifted generic: the list is a stock filterable directory (badge count, search/select/button, pill sort chips, flat link rows) rather than an urgency-ranked queue; the admin-only additions (a permanently-visible red delete card, a floating "Danger zone" popover, hand-rolled centered modals) read as generic admin-tool chrome; and the submit flow isn't written for admins at all — it reuses the client portal's `SubmissionForm` wholesale, so an admin filling it out sees stakeholder-voice copy and a stage rail that says "Awaiting your review."

**Deterministic scan:** `impeccable detect --json` returned exit code 2, 3 findings, all in `page.tsx` (list) — zero in `[id]/` or `submit/`:
- `side-tab` warning at `page.tsx:288` (`border-l-4` driven by `accentClass({status, payment_override, overdue})`) — **confirmed false positive**, the same functional state-keyed pattern already established twice in the home-profile pass.
- 2× `design-system-font-size` advisories at `page.tsx:300` and `:303` (`text-[11px]` on the Override and status pills) — real: same 12px-floor violation the home-profile pass already fixed on the dashboard, apparently not carried over to this list.

**Visual overlays:** live injection succeeded on all three pages. List: 2 anti-patterns (low-contrast text at 4.4:1, just under the 4.5:1 floor). Detail page: 7, the two most material being `first-viewport-column-overflow` (the left rail runs 142% of viewport height against the right column's 64%, per Assessment B's measurement — corroborating Assessment A's mobile "Right Now below the fold" finding) and `cramped-padding`. Submit page: 3, including a `side-tab` finding on the shared `ClientHeaderCard` — traced to source (`ClientHeaderCard.tsx:27`) and confirmed as **also a false positive**: its left edge is driven by a `tone` prop (`neutral`/`amber`/`green`) that mirrors the Right Now card's urgency tone, exactly the pattern DESIGN.md documents ("The header follows the Right now tone"). `nested-cards` on the submit page is real and matches Assessment A's independent finding that the client/stakeholder picker is a bordered box nested inside the Right Now card.

# Overall Impression

The bones are right — the stage rail and Right Now pairing that make the consultant and stakeholder pages work are present here too, and the admin-specific status logic (round tallies, PBDB grouping) is genuinely well done. But the page contradicts itself at the worst moment (a revision-required project's banner disagrees with its own header), buries the admin's most unique power (payment override) in an unreachable popover, and gives "Delete" permanent prime real estate while override/pause/revert have to fight for space. The submit flow is the biggest specificity miss: an admin filling it out is reading a client's voice. Single biggest opportunity: make the list a ranked queue the way the consultant dashboard already is, instead of a filterable directory sorted by creation date.

# What's Working

1. **The stage rail's admin-specific adaptation.** Swapping "Project number" for "Number & consultant" without changing the rail's length or breaking its signature look is exactly the kind of per-role adaptation Product Principle 2 calls for, not a bolted-on admin mode.
2. **High-stakes actions explain their consequences in words.** Override says exactly what it bypasses and that it's logged; Revert explains the re-approval consequence; Delete names the 30-day recovery bin. The copy is right even where some of the containers around it aren't (see Priority Issues).
3. **Round-aware status on the list.** `resolveStaffStatus` plus `ReviewTallyChip` surfaces where a review round stands without opening the project — genuinely OPS-specific and well executed.

# Priority Issues

**[P1] The floating Config popover is taller than most laptop viewports — the admin's own unique controls (payment override, delivery timing) are unreachable**
- **What:** `SettingsPill.tsx:34` is `fixed bottom-20 ... w-80` with no `max-h`/`overflow-y`; measured height was 857px with its top at −495px in an 800px-tall pane. Payment gate / Apply payment override sits at the top, off-screen on common laptop heights, with no way to scroll to it. The pill also permanently overlaps the "Documents" tab label and stage-rail labels on mobile, and truncates its own Danger-zone descriptions ("Delivery date shifts by th…").
- **Why it matters:** the one action that's uniquely the admin's to take is the least reachable control on the page.
- **Fix:** add `max-h-[calc(100vh-7rem)] overflow-y-auto` as an immediate fix; longer-term, promote payment gate and pause into the rail/header as first-class admin controls and keep the popover for delivery-timing preferences only.
- **Suggested command:** `/impeccable harden` (then `/impeccable layout`)

**[P1] Status contradicts itself, and "overdue" red has stopped meaning anything**
- **What:** the overdue banner switches on stored `project.status` while the header pill and Right Now card key off `effectiveStatus` — on a revision-required project mid-round, the banner says "the consultant must upload a corrected document" while the header says "Awaiting Approval." Separately, 6 of 11 rows on the list carry a red left edge plus a red Overdue pill with no day count (the list's `OverduePill` gets no `days` prop; the detail page's does, showing "Overdue · 13d").
- **Why it matters:** admins triage by colour and trust the status line; a status that visibly disagrees with itself erodes both, and directly breaks DESIGN.md's own "colour... rare enough to mean something" rule.
- **Fix:** drive the banner from the same `effectiveStatus`/round-state source as the header, or fold its message into the Right Now card's subtitle and drop the separate banner; show "Overdue · Nd" on the list and consider reserving the red left edge for revision-required or N+ days overdue rather than every overdue row equally.
- **Suggested command:** `/impeccable clarify`

**[P1] The mobile project list overlaps, and the stage rail clips on mobile detail/submit pages**
- **What:** `page.tsx:291`'s title is `<span className="truncate">` — an inline element, where `truncate` is a no-op — so at 375px titles run under the `shrink-0` pill cluster. Separately, the horizontal stage stepper (shared between the detail page and the submit page) clips its last step ("Delivered") flush against the 375px viewport edge with no scroll affordance, and the Right Now card renders below the fold on mobile detail pages.
- **Why it matters:** this is the same truncation bug the home-profile pass already fixed on the dashboard's `ActiveProjectsList.tsx`, apparently not caught here because it's a separate component; on mobile the stepper clipping hides the terminal state of the workflow entirely.
- **Fix:** `block truncate` on the title span, matching the home-profile fix exactly; make the stepper horizontally scrollable with a fade/affordance below `sm`, or wrap it; reorder so Right Now appears directly after the header on mobile instead of after the full rail.
- **Suggested command:** `/impeccable adapt`

**[P2] Destructive admin actions sit where routine work happens**
- **What:** a red-tinted "Delete project" card is permanently visible in the left rail on every live project, with an inline confirm that gets clipped by the sticky rail's own scroll container; "Revert to PBDB" is a red button sitting directly beside the routine "Resend delivery email" action in the Delivered card; the Pause trigger is danger-red but its own confirmation dialog is amber.
- **Why it matters:** red is supposed to mean workflow state, not "a destructive control exists nearby" — this dilutes the same signal Priority Issue 2 is about, in the rail that's the most-looked-at column on the page.
- **Fix:** consolidate into a single, quiet "More actions" disclosure at the bottom of the rail rather than a permanent card; demote Revert to a secondary text action under a divider; give Pause's trigger and confirm matching (amber, non-danger) tones; move Delete's confirm into a proper dialog so it isn't clipped by a scroll container.
- **Suggested command:** `/impeccable distill`

**[P2] The admin submit flow speaks in the client's voice**
- **What:** `SubmitOnBehalfForm` wraps the portal's `SubmissionForm` directly, so an admin sees "Submitted → Being prepared → Awaiting your review → Finalizing" before anything is submitted, a Right Now subtitle reading "upload the appropriate pdf files," and "becomes your report request record." The Client/Stakeholder selects have no label association (`labels` measured empty) and truncate to "Select a clier" in a cramped 2-column grid nested inside the Right Now card — itself a violation of DESIGN.md's one-bordered-container-per-level rule (confirmed live as a `nested-cards` finding).
- **Why it matters:** this is the clearest specificity miss in the group — reused copy that assumes the viewer is the client, in a flow the admin uses to act *for* a client.
- **Fix:** pass role-aware copy and stage labels (e.g. "On behalf of Stockland · Sarah Whitmore"), stack the selects to one column, associate the labels, and pull the picker out of the Right Now card into its own container.
- **Suggested command:** `/impeccable clarify`

# Persona Red Flags

**Alex (Power User):** no bulk reassign/pause/export and no pagination on a list that loads every project unbounded; search needs a button click and "Client…" is free-text ILIKE rather than a picker; sorting by "Status" orders by the stored enum, not urgency; rows omit due date, consultant availability, and days-overdue, forcing a click-through for every triage decision; delivery timing can be set in two different places (the Right Now dispatch body and the Config popover).

**Sam (Accessibility-Dependent):** the list's search and "Client…" filter inputs have no labels; the admin project-number `<label>` isn't associated with its input (measured `labels` empty); the submit flow's selects are unlabelled; override/revert/pause modals have no `role="dialog"`, no focus trap, and no Escape key (the Drawer fix from the home-profile pass wasn't applied to these); help exists only as hover-only `title` tooltips, useless on touch or keyboard, and one is factually stale (project-number uniqueness).

**Casey (Mobile):** the overlapping list rows; the clipped stage rail and below-the-fold Right Now card on the detail page; the overdue banner telling a single-column mobile viewer to check "the panel on the left"; the Config popover is taller than the phone's own viewport.

# Minor Observations

- The "11" project-count badge is `bg-blue-100 text-blue-700` — a state hue used decoratively, and it stays blue even at a count of 0.
- The Override and status pills on the list are `text-[11px]`, the same 12px-floor violation the home-profile pass fixed on the dashboard.
- The list container is `max-w-5xl` while the detail page is `max-w-7xl`, leaving roughly 40% dead space on the list at 1440px.
- Document filenames aren't `font-mono` and truncate with no `title`, though DESIGN.md specifies mono for filenames.
- Client contact email links are plain `text-blue-600`, outside the documented palette.
- A Draft project's Right Now card and the admin project-number form both separately say almost the same thing ("Unlocks consultant assignment and PBDB generation" / "Set the project number to unlock PBDB generation") — stale duplication once a consultant is already assigned.
- Audit-trail export buttons use `rounded` (4px) where DESIGN.md specifies `rounded-md` for controls; rail cards (ConsultantCard, the delete card) use `rounded-lg` where DESIGN.md specifies `rounded-xl` for page-level cards.
- `aria-selected` on the Details/Documents/Stakeholders tab buttons doesn't update when the active tab changes via click, though the panel content does switch correctly.

# Questions to Consider

1. If the admin's unique value is intervention (override, reassign, pause, revert), why does the page make those the hardest things to reach, while "Delete" gets permanent prime real estate in the rail?
2. Should the admin list be a queue sorted by urgency — the way the consultant dashboard already sorts "revisions first, then most overdue" — rather than a filterable directory sorted by creation date? What decision does an admin actually open this page to make?
3. With roughly half of visible projects overdue in this data, is "overdue" still a meaningful state or just the weather? Should severity (days overdue, or overdue-and-blocked-on-us) replace a binary red edge?
