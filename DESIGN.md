---
name: OPS (Online Performance Solution)
description: Quiet zinc-neutral operations tool where colour is reserved for workflow state.
colors:
  ink: "#18181b"
  ink-strong-hover: "#3f3f46"
  text-secondary: "#71717a"
  text-muted: "#a1a1aa"
  border-strong: "#d4d4d8"
  border: "#e4e4e7"
  border-subtle: "#f4f4f5"
  surface: "#ffffff"
  surface-sunken: "#fafafa"
  surface-tint: "#f4f4f5"
  danger: "#dc2626"
  danger-text: "#b91c1c"
  danger-tint: "#fee2e2"
  danger-wash: "#fef2f2"
  warning-text: "#b45309"
  warning-tint: "#fef3c7"
  success: "#10b981"
  success-text: "#15803d"
  success-tint: "#dcfce7"
  info-text: "#1d4ed8"
  info-tint: "#dbeafe"
  progress-text: "#7e22ce"
  progress-tint: "#f3e8ff"
typography:
  title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  focus-title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
  caption:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
  data-mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page-gap: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-strong-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-strong-hover}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  status-pill:
    rounded: "{rounded.full}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: OPS (Online Performance Solution)

This describes what ships today. Values are Tailwind v4 defaults; the app defines no custom colour, spacing or radius tokens of its own (only `--background`/`--foreground` in `app/globals.css`). Hex values are the Tailwind v3-equivalent of the default palette, listed for portability.

## Overview

**Creative North Star: "The Ops Ledger"**

A quiet ledger for people who work a queue all day. Surfaces are white and near-white zinc with thin borders and almost no shadow; density comes from small type (14px body, 11-12px labels) and compact rows. Colour is not decoration: it appears only to say where a project stands (overdue, revision required, awaiting approval, delivered), so a red or amber element on the page is always a claim about state.

The page favours one dominant object per screen. On a project, that is the "Right now" card in the left rail, tinted by urgency, beside a stage rail that shows the whole workflow at a glance. Reference material (details, documents, stakeholders, audit trail) sits behind tabs and collapsible sections so it does not compete.

**Key Characteristics:**
- Zinc-neutral base, state-coloured accents, no brand colour.
- Flat by default: 1px borders do the work, shadows are rare.
- Small, dense type; weight 500-600 carries hierarchy more than size.
- Pills and left-edge accents encode status; the same status hues repeat across dashboard, lists and project page.

## Colors

Neutral zinc scale for structure; four semantic families (red, amber, green, blue/purple) for workflow state.

### Primary
- **Ink** (#18181b, zinc-900): primary text, primary buttons, current tab underline, active stage disc when neutral.

### Neutral
- **Ink Hover** (#3f3f46, zinc-700): primary-button hover, strong secondary text.
- **Text Secondary** (#71717a, zinc-500): labels, secondary copy, inactive tabs. Passes 4.5:1 on white.
- **Text Muted** (#a1a1aa, zinc-400): currently used for real content (client name, header stat labels, dates, "Right now" eyebrow, upcoming stage labels). Only about 2.4-2.6:1 on white or zinc-50; see Do's and Don'ts.
- **Border / Border Strong / Border Subtle** (#e4e4e7 / #d4d4d8 / #f4f4f5): card outlines, input outlines, row dividers.
- **Surface / Surface Sunken** (#ffffff / #fafafa, plus #f4f4f5 tints): cards, table headers, segmented-control track.

### Semantic
- **Danger** (#dc2626 accent, #b91c1c text, #fee2e2 pill, #fef2f2 wash): overdue, revision required, rejected, flagged. Red "Right now" card and header left edge for revision required.
- **Warning** (#b45309 text, #fef3c7 pill): awaiting approval, paused, amber urgency.
- **Success** (#10b981 accent, #15803d text, #dcfce7 pill): completed stage discs, delivered.
- **Info / Progress** (#1d4ed8 on #dbeafe; #7e22ce on #f3e8ff): submitted, portal source badge; in progress and converting.
- **Assigned** (zinc-200 fill, zinc-700 text, zinc-400 left accent): neutral, because assigned work is waiting, not urgent. It deliberately no longer uses yellow, which read as the amber "Awaiting approval".

### Named Rules
**The Colour-Is-State Rule.** Hue is reserved for workflow status and urgency. Do not introduce accent colour for emphasis, branding or decoration.

**The Never-Colour-Alone Rule.** Every state colour must be accompanied by text (pill label, heading) or an icon. The stage rail already does this; keep it.

## Typography

**Body Font:** Geist (loaded in `app/layout.tsx` via `next/font`), falling back to Arial. **Shipped reality:** `app/globals.css` sets `body { font-family: Arial, Helvetica, sans-serif }`, which overrides the Geist variable, so Arial is what renders today. Recorded here as Geist per the owner; the override is a critique finding.
**Mono:** Geist Mono is used for identifiers only: document filenames, stakeholder email addresses and project numbers (`font-mono`). Nothing else is mono.

**Character:** Neutral and utilitarian; hierarchy through weight and colour, not scale.

### Hierarchy
- **Title** (600, 16px, tracking-tight): project title in the header card.
- **Focus title** (600, 18px): the "Right now" card heading, the largest text on the page.
- **Body** (400-500, 14px): table values, form fields, buttons.
- **Label** (500, 12px): field labels, badges, secondary buttons, meta.
- **Caption** (500, 12px): stage labels, pill text, small counts. 12px is the floor for any content text; 10px and 11px are no longer used on the dashboard or project page.

Usage counts across `app/` and `components/`: `text-sm` about 1000, `text-xs` about 930, `text-base` 59, `text-xl`/`2xl` 35.

### Named Rules
**The Tabular Rule.** Dates, revision numbers and counts use tabular figures so columns and header stats align.

**The Balanced Title Rule.** Project titles and card headings use `text-wrap: balance` with tight tracking (-0.025em) so long addresses never leave an orphaned last word.

## Layout

Project page: full-width header card, then a primary tab row (Workspace / Audit trail). Workspace is a two-column grid, left rail 25rem (stage rail + Right now card + extras, sticky on md+) and a fluid right column (segmented Details / Documents / Stakeholders, then collapsible sections). Vertical rhythm is 16-20px between blocks (`space-y-4`, `gap-5`); cards pad 12-20px; rows pad 12px vertical. Below md the columns stack. Content is wide and unconstrained; long unbroken values are handled with `min-w-0`.

**Consultant dashboard ("My projects").** Single column, `space-y-5`, full width: page title + primary "Submit request" button; a 4-up summary strip (2-up on mobile); one "Right now" banner row (two side by side when both an assignment and a review need attention); a segmented list switcher (Active / With stakeholders / Archive / Available jobs); then stacked 20px-padded project rows (available jobs are a 2-up grid of cards). It is a queue view: the banner and tinted rows carry urgency, everything else is white or zinc.

**Stakeholder portal (`app/(client)/portal`).** Same tokens and components, narrower frame: header bar `h-11` on a `max-w-5xl` column (vs the consultant's full width). Dashboard = title + "New report request", a 4-up tile strip (Needs your review / In progress / Ready / Credits or Total active), one or two compact "Right now" banners, then category pills (All / Needs your review / In progress / Delivered) plus a Filters popover, a search input and a sort select, then `rounded-xl` request cards with a status pill and a `MiniStepper`. Project page = `ClientHeaderCard` (3px blue left edge, always blue), then a 22rem sticky left rail (StageRail + FocusCard + Reference card) beside Overview / Documents / Review buttons. Differences from the consultant screens: no Overdue indicator by design (clients should not feel due-date pressure); status is shown as a stepper stage label plus a round badge, not workflow status names; pills use `rounded-full px-2.5 py-1`; Reference and filter headings use `uppercase tracking-wide text-zinc-400`.

## Elevation & Depth

Flat by default. Depth is tonal: white cards on a white/zinc-50 page separated by 1px zinc borders. Shadows are rare and soft: `shadow-sm` on the active segmented tab and inputs; the neutral Right now card adds `shadow-sm shadow-blue-100`. Floating elements (modals, drawers, the Available and Delivery Config pills) use custom low-opacity shadows: `0 8px 30px rgb(0 0 0 / 0.10)` for panels and `0 4px 16px rgb(0 0 0 / 0.08)` for pills. Buttons never carry a shadow. The `:target` anchor highlight pulses an amber ring for 2.5s.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; shadow appears only on floating or actively selected elements.

## Shapes

Softly rounded rectangles with one rule: **page-level cards `rounded-xl` (12px)** (tiles, banners, project rows, header card, rail cards, collapsible sections, stage rail, Right now card); **contained boxes and callouts `rounded-lg` (8px)**; **controls `rounded-md` (6px)**; `rounded-full` for pills and stage discs only. Left-edge 3px accent border on the header card encodes status. Focus card uses a 2px border; everything else 1px.

## Components

### Buttons
- **Primary:** zinc-900 fill, white 14px/500 text, 6px radius, 8x16px padding; hover zinc-700; disabled 50% opacity. Compact variant 6x12px at 12px text.
- **Secondary:** white with 1px zinc-300 border, zinc-700 text, hover zinc-100/50.
- **Danger:** red text or fill within Right now and admin actions.
- **Focus:** inconsistent. Inputs use `focus:ring-1 zinc-500`; most buttons have no explicit focus style (the tab bars, collapsible headers and segmented control gained `focus-visible` rings on this branch).

### Status pills
Full-radius, 12px/500, 2x8px padding, tinted background with matching -700 text (see Colors). One pill for status, one for source (Portal blue / Email green), Overdue red, Override amber.

### Cards / Containers
White, 1px zinc-200 border, 12px radius, 16px padding (`p-4`) for rows and rail cards, 20px (`p-5`) for the header and Right now card. **One bordered container per level:** inside a card use hairline dividers (`border-t`, `divide-y`) and plain text on the tint, never a second bordered box (rejection reasons, pending reviews and PBDB version tiers follow this). State-tinted cards use the -200 border; only the Right now card uses 2px -300. `CollapsibleSection` = bordered card with a 14px/600 title, optional 12px subtitle and a rotating chevron; body separated by a zinc-100 rule.

### Inputs / Fields
6px radius, 1px zinc-300 border, 14px text, zinc-400 placeholders; focus swaps to zinc-500 border plus a 1px ring. Errors appear as red inline text or red-tinted panels (`border-red-100 bg-red-50/40`).

### Navigation
Top bar with logo, Workspace / Email Queue links, notification bell and user menu. Project tabs are a 2px underline bar (primary) and a zinc-100 segmented control (secondary), both plain buttons with no tab roles.

### Stage rail (signature)
Rounded card with a zinc gradient holding a horizontal stepper: done = emerald disc with check; current = urgency-coloured disc with a 5px tinted ring; upcoming = dashed zinc-300 disc. 3px connector fills emerald when the previous stage is done.

### Right now card (signature)
A 2px-bordered, urgency-tinted (blue neutral / amber / red / green) card with a "Right now" eyebrow, an 18px title and the single next action's form. It is the visual anchor of the page.

### Summary tile (dashboard)
`rounded-xl` bordered card, 16px padding, 24px semibold tabular count over a 12px label. Tone = state: amber when something needs a response, green when jobs are available, blue for Active when non-zero, white otherwise.

### Compact "Right now" banner (dashboard)
`rounded-lg`, 1px tone border and tinted fill (amber assignment, red review/overdue, blue caught-up), one line: 14px semibold "Right now", 12px subtitle, action buttons right-aligned; expands in place into a per-item picker when there are several.

### Project row (dashboard)
`rounded-xl` bordered card, 20px padding: 16px semibold title (link), 12px zinc meta lines, status pill and Overdue/Flagged chips stacked top-right, and an action strip under a tinted rule for pending assignments (Accept/Decline) or revision review. Fill encodes state: amber = pending assignment, red = revision, white = otherwise.

### List switcher (dashboard)
Bordered white track with 4 equal ARIA tabs (2x2 on phones); selected = zinc-900 fill with white text, others zinc-600 text; counts in parentheses. Sticky under the header from `sm` up. The URL is the state (`?tab=&page=&q=`); each tab is paged server-side at 20, with a debounced search box once a list has more than 6 items and Previous/Next controls. Rows sort revisions first, then most overdue, then the rest; the Overdue pill shows days ("Overdue · 6d").

## Do's and Don'ts

### Do:
- **Do** keep hue for state only; pair every colour with text or an icon.
- **Do** keep one dominant object (Right now) and let reference content recede behind tabs and collapsibles.
- **Do** use tabular figures for dates and numbers, and Geist Mono for filenames, emails and project numbers.
- **Do** give every interactive control a visible `focus-visible` style (2px zinc-400 ring, inset where clipped).
- **Do** keep motion short and purposeful: entrances 120-180ms on `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`), on-screen movement 300ms on `--ease-in-out` (`cubic-bezier(0.77, 0, 0.175, 1)`), press feedback 160ms at `scale(0.97)`. Animate `transform`, `scale` and `opacity` only; exits are instant or faster than entrances; nothing animates on frequent or keyboard-driven actions beyond a 120ms fade. Under `prefers-reduced-motion` soften rather than remove: keep the fades, drop scale, translate, press and rotation motion.

### Don't:
- **Don't** use zinc-400 for text that carries information (client name, labels, dates, eyebrows); use zinc-500 (4.6:1) or darker. Zinc-400 is acceptable only for disabled or decorative text.
- **Don't** introduce brand colour, gradients on text, or decorative shadows.
- **Don't** convey state by colour alone or rely on hover for information.
- **Don't** go below 12px for readable content.
- **Don't** nest a bordered box inside a bordered card, or add a shadow to a button.
- **Don't** let Arial and Geist compete: the global `body` font override should be resolved to one family.
