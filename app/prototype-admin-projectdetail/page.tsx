"use client";

// PROTOTYPE — throwaway, do not ship.
//
// Question: the admin project detail page (app/(admin)/admin/projects/[id]/page.tsx)
// predates the workspace visual language now used by the client portal
// (app/(client)/portal/projects/[id]/_components/ClientWorkspace.tsx) and the
// consultant workspace (app/(consultant)/ops/projects/[id]/_components/AltWorkspace.tsx):
// a header card with a left status accent, a sticky StageRail + spotlighted
// "Right now" FocusCard in the left rail, and pill tabs on the right. The
// admin page instead stacks five full tabs (Overview / Admin Workflow /
// Consultant Workflow / Controls / Audit) built from numbered StepCards —
// it duplicates the *entire* consultant workflow tab verbatim (see the
// comment at real page.tsx:654) just so admins can watch the consultant's
// steps, and buries payment override / pause / delete in a fifth tab.
//
// Admin has strictly more surface than client or consultant: it owns every
// step either role can take (set number, generate/upload PBDB, assign,
// dispatch, convert) *plus* admin-only levers (payment gate, pause/resume,
// delete, resend tokens/waive per stakeholder) that have no equivalent in
// the other two workspaces.
//
// Round 1 answered "where does the admin-only surface go": A (one track,
// settings pill), B (two tracks — admin vs consultant), C (one track,
// permanent controls card).
//
// Round 2 — full function audit. Read every _components file under both
// app/(admin)/admin/projects/[id]/ and app/(consultant)/ops/projects/[id]/
// in full; round 1 was missing real functions, not just polish:
//   - Evidence & correspondence (AttachEvidenceForm — both pages)
//   - Submission document upload + listing (FileUploadForm — both pages)
//   - Reassigning a consultant after initial assignment (AssignForm
//     isReassign, admin-only)
//   - Resetting the project number after it's set (no lock in the real
//     forms — both pages)
//   - Regenerating the PBDB while `canRegeneratePbdb` (assigned/in_progress
//     — both pages)
//   - Resending the PBDR download link once delivered (ResendPbdrButton,
//     admin-only)
//   - Updating a pending stakeholder's email (UpdateEmailForm, admin-only)
//   - Delivery delay preset + pending-delivery lock-in panel
//     (ProjectDeliveryDelayPresetSelect / PendingDeliveryPanel — both pages)
//   - Client document colour toggle (ProjectStripColorToggle — both pages,
//     folded into the delivery/payment controls card here)
//   - Project-level stakeholder override list (ProjectStakeholderSection,
//     admin-only)
//   - Editable extracted fields / PO number / delivery recipient
//     (ProjectDetailsEditor — both pages)
//   - Audit CSV/PDF export links (both pages)
//   - Logging a stakeholder's review response on their behalf
//     (LogStakeholderResponseForm) — this one is a real production bug, not
//     just a prototype gap: it exists on the CONSULTANT page only
//     (stakeholdersTab, gated by canLogOnBehalf). The admin page has no
//     equivalent at all, despite having every other per-stakeholder lever
//     (resend/waive/update email). Fixed here on both roles' shared
//     pending-stakeholder row so it can't drift again.
//
// These are folded into the shared DetailsTab/DocumentsTab/StakeholdersTab/
// ControlsCard/AdminFocus so all five variants get them for free.
//
// Round 2 also asks a second, narrower question: for the handful of steps
// that are "done" but legitimately need reopening (project number,
// assignment, PBDB while regenerable) — how does a done StageRail node
// become actionable without feeling like a hidden feature?
//
//   D — Click-to-expand. Reopenable `done` nodes get a small, always-visible
//       pencil badge (not hover-only). Clicking opens an inline accordion
//       panel directly under the rail — its own card, never replacing the
//       FocusCard — so "what's blocking delivery right now" is never
//       disturbed by going to fix something earlier. Keeps the rail compact
//       when nothing's being edited.
//
//   E — Always-visible edit cards. No badge, no click, nothing to discover:
//       matches the precedent already in production on the consultant page
//       (ProjectNumberCard / PbdbVersionsCard in leftRailExtras — permanent
//       cards, no reveal step). Maximally discoverable, at the cost of a
//       taller left rail once several steps are past "current".
//
// Mock data only — read-only, no real queries or mutations. A scenario
// switcher (top-left, dev-only) drives 7 lifecycle states through all five
// variants.

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StageRail, type Stage } from "@/components/workspace/StageRail";
import { FocusCard } from "@/components/workspace/FocusCard";

// ─── Domain types & mock data ───────────────────────────────────────────────

type ProjectStatus =
  | "draft" | "submitted" | "assigned" | "in_progress" | "dispatched"
  | "revision_required" | "converting" | "delivered" | "complete" | "paused";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft", submitted: "Submitted", assigned: "Assigned",
  in_progress: "In Progress", dispatched: "Awaiting Approval",
  revision_required: "Revision Required", converting: "Converting to PBDR",
  delivered: "Delivered", complete: "Complete", paused: "Paused",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500", submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-yellow-100 text-yellow-700", in_progress: "bg-purple-100 text-purple-700",
  dispatched: "bg-amber-100 text-amber-700", revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700", delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500", paused: "bg-amber-100 text-amber-700",
};

const STATUS_ACCENT: Record<ProjectStatus, string> = {
  draft: "border-l-zinc-300", submitted: "border-l-blue-400", assigned: "border-l-yellow-400",
  in_progress: "border-l-purple-400", dispatched: "border-l-amber-400",
  revision_required: "border-l-red-400", converting: "border-l-purple-400",
  delivered: "border-l-green-500", complete: "border-l-zinc-300", paused: "border-l-amber-400",
};

type Review = { name: string; email: string; status: "pending" | "approved" | "rejected"; comments?: string };
type FileRef = { name: string; date: string };
type EvidenceRef = { ref: string; date: string };
type StakeholderOverride = { name: string; email: string; company?: string };

type Scenario = {
  key: string;
  label: string;
  status: ProjectStatus;
  projectNumber: string | null;
  poNumber: string | null;
  address: string;
  clientName: string;
  source: "portal" | "email";
  assignedName: string | null;
  availability: "available" | "on_leave" | "at_capacity" | null;
  reviewCycle: number;
  createdAt: string;
  dueDate: string | null;
  deliveryRecipient: string | null;
  creditDeducted: boolean;
  pbdbVersions: { version: number; date: string }[];
  qaCompleted: boolean;
  pbdrVersions: { version: number; date: string }[];
  reviews: Review[];
  submissionFiles: FileRef[];
  evidenceFiles: EvidenceRef[];
  deliveryDelayPreset: "same_day" | "next_business_day" | "two_business_days";
  pendingDelivery: string | null;
  assignmentHistory: { name: string; date: string }[];
  projectStakeholders: StakeholderOverride[];
};

const SCENARIOS: Scenario[] = [
  {
    key: "fresh", label: "1 — Fresh submission",
    status: "submitted", projectNumber: null, poNumber: "PO-88213",
    address: "14 Kestrel Ave, Brookvale NSW", clientName: "Stockland",
    source: "portal", assignedName: null, availability: null, reviewCycle: 1,
    createdAt: "2026-07-15", dueDate: "2026-07-24", deliveryRecipient: "ops@stockland.com.au",
    creditDeducted: false, pbdbVersions: [], qaCompleted: false, pbdrVersions: [], reviews: [],
    submissionFiles: [{ name: "Purchase Order.pdf", date: "2026-07-15" }],
    evidenceFiles: [], deliveryDelayPreset: "next_business_day", pendingDelivery: null,
    assignmentHistory: [], projectStakeholders: [],
  },
  {
    key: "preparing", label: "2 — Consultant preparing PBDB",
    status: "in_progress", projectNumber: "24-0113", poNumber: "PO-88213",
    address: "14 Kestrel Ave, Brookvale NSW", clientName: "Stockland",
    source: "portal", assignedName: "Priya Nathan", availability: "available", reviewCycle: 1,
    createdAt: "2026-07-10", dueDate: "2026-07-24", deliveryRecipient: "ops@stockland.com.au",
    creditDeducted: true, pbdbVersions: [], qaCompleted: false, pbdrVersions: [], reviews: [],
    submissionFiles: [{ name: "Purchase Order.pdf", date: "2026-07-10" }, { name: "Building Plans.pdf", date: "2026-07-10" }],
    evidenceFiles: [], deliveryDelayPreset: "next_business_day", pendingDelivery: null,
    assignmentHistory: [{ name: "Priya Nathan", date: "2026-07-11" }], projectStakeholders: [],
  },
  {
    key: "readyToDispatch", label: "3 — Ready to dispatch",
    status: "in_progress", projectNumber: "24-0113", poNumber: "PO-88213",
    address: "14 Kestrel Ave, Brookvale NSW", clientName: "Stockland",
    source: "portal", assignedName: "Priya Nathan", availability: "available", reviewCycle: 1,
    createdAt: "2026-07-10", dueDate: "2026-07-24", deliveryRecipient: "ops@stockland.com.au",
    creditDeducted: true, pbdbVersions: [{ version: 1, date: "2026-07-16" }], qaCompleted: true,
    pbdrVersions: [], reviews: [],
    submissionFiles: [{ name: "Purchase Order.pdf", date: "2026-07-10" }, { name: "Building Plans.pdf", date: "2026-07-10" }],
    evidenceFiles: [{ ref: "Forwarded email — updated DA conditions", date: "2026-07-15" }],
    deliveryDelayPreset: "next_business_day", pendingDelivery: null,
    assignmentHistory: [{ name: "Priya Nathan", date: "2026-07-11" }], projectStakeholders: [],
  },
  {
    key: "dispatched", label: "4 — Awaiting stakeholders",
    status: "dispatched", projectNumber: "24-0098", poNumber: "PO-77120",
    address: "212 Marina Blvd, Southport QLD", clientName: "Mirvac",
    source: "email", assignedName: "Tom Reilly", availability: "at_capacity", reviewCycle: 1,
    createdAt: "2026-07-05", dueDate: "2026-07-20", deliveryRecipient: "reports@mirvac.com",
    creditDeducted: true, pbdbVersions: [{ version: 1, date: "2026-07-12" }], qaCompleted: true,
    pbdrVersions: [],
    reviews: [
      { name: "Alan Wu", email: "alan.wu@mirvac.com", status: "approved" },
      { name: "Ceecee Farrow", email: "ceecee.farrow@mirvac.com", status: "pending" },
      { name: "David Kohn", email: "david.kohn@mirvac.com", status: "pending" },
    ],
    submissionFiles: [{ name: "Purchase Order.pdf", date: "2026-07-05" }],
    evidenceFiles: [],
    deliveryDelayPreset: "two_business_days", pendingDelivery: null,
    assignmentHistory: [{ name: "Priya Nathan", date: "2026-07-02" }, { name: "Tom Reilly", date: "2026-07-06" }],
    projectStakeholders: [{ name: "Extra Reviewer", email: "legal@mirvac.com", company: "Mirvac Legal" }],
  },
  {
    key: "revision", label: "5 — Revision requested",
    status: "revision_required", projectNumber: "24-0071", poNumber: null,
    address: "9 Larkspur Cl, Doreen VIC", clientName: "Frasers Property",
    source: "portal", assignedName: "Priya Nathan", availability: "available", reviewCycle: 2,
    createdAt: "2026-06-28", dueDate: "2026-07-14", deliveryRecipient: "compliance@frasersproperty.com.au",
    creditDeducted: true, pbdbVersions: [{ version: 1, date: "2026-07-02" }], qaCompleted: true,
    pbdrVersions: [],
    reviews: [
      { name: "Isla Munro", email: "isla.munro@frasersproperty.com.au", status: "rejected", comments: "Egress width on the western stair doesn't match the amended DA — please re-check against Rev C." },
      { name: "Ben Okafor", email: "ben.okafor@frasersproperty.com.au", status: "approved" },
    ],
    submissionFiles: [{ name: "Purchase Order.pdf", date: "2026-06-28" }],
    evidenceFiles: [{ ref: "Phone call notes — Isla Munro", date: "2026-07-13" }],
    deliveryDelayPreset: "same_day", pendingDelivery: null,
    assignmentHistory: [{ name: "Priya Nathan", date: "2026-06-29" }], projectStakeholders: [],
  },
  {
    key: "readyToConvert", label: "6 — Approved, payment gate blocking",
    status: "dispatched", projectNumber: "24-0055", poNumber: "PO-90441",
    address: "3 Anchorage Tce, Newstead QLD", clientName: "Lendlease",
    source: "portal", assignedName: "Tom Reilly", availability: "at_capacity", reviewCycle: 1,
    createdAt: "2026-06-20", dueDate: "2026-07-05", deliveryRecipient: "delivery@lendlease.com",
    creditDeducted: false, pbdbVersions: [{ version: 1, date: "2026-06-24" }], qaCompleted: true,
    pbdrVersions: [],
    reviews: [
      { name: "Grace Petrov", email: "grace.petrov@lendlease.com", status: "approved" },
      { name: "Hugo Byrne", email: "hugo.byrne@lendlease.com", status: "approved" },
    ],
    submissionFiles: [{ name: "Purchase Order.pdf", date: "2026-06-20" }],
    evidenceFiles: [], deliveryDelayPreset: "next_business_day", pendingDelivery: "2026-07-20",
    assignmentHistory: [{ name: "Tom Reilly", date: "2026-06-21" }], projectStakeholders: [],
  },
  {
    key: "delivered", label: "7 — Delivered",
    status: "delivered", projectNumber: "24-0002", poNumber: "PO-65310",
    address: "77 Coronation Dr, Milton QLD", clientName: "GPT Group",
    source: "portal", assignedName: "Priya Nathan", availability: "available", reviewCycle: 1,
    createdAt: "2026-06-01", dueDate: "2026-06-15", deliveryRecipient: "records@gpt.com.au",
    creditDeducted: true, pbdbVersions: [{ version: 1, date: "2026-06-05" }], qaCompleted: true,
    pbdrVersions: [{ version: 1, date: "2026-06-08" }],
    reviews: [{ name: "Nadia Fitch", email: "nadia.fitch@gpt.com.au", status: "approved" }],
    submissionFiles: [{ name: "Purchase Order.pdf", date: "2026-06-01" }],
    evidenceFiles: [], deliveryDelayPreset: "next_business_day", pendingDelivery: null,
    assignmentHistory: [{ name: "Priya Nathan", date: "2026-06-02" }], projectStakeholders: [],
  },
];

const DELAY_LABELS: Record<Scenario["deliveryDelayPreset"], string> = {
  same_day: "Same day", next_business_day: "Next business day", two_business_days: "2 business days",
};

type Toggles = { overdue: boolean; override: boolean; paused: boolean };

function fmtDMY(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function pendingCount(sc: Scenario) {
  return sc.reviews.filter((r) => r.status === "pending").length;
}

function canRegenPbdb(sc: Scenario) {
  return sc.pbdbVersions.length > 0 && (["assigned", "in_progress"] as ProjectStatus[]).includes(sc.status);
}

// ─── Small shared icons ─────────────────────────────────────────────────────

function PencilIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

// Matches app/(consultant)/ops/projects/[id]/_components/HeaderStatInline.tsx exactly.
function HeaderStatInline({ label, value, valueClassName, noLeftBorder }: {
  label?: string; value: React.ReactNode; valueClassName?: string; noLeftBorder?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${noLeftBorder ? "" : "border-l border-zinc-100 pl-7"}`}>
      {label && <span className="text-zinc-400">{label}</span>}
      <span className={`font-medium text-zinc-900 ${valueClassName ?? ""}`}>{value}</span>
    </span>
  );
}

// Matches the consultant page's altHeaderCard exactly (badges row, then a
// border-t stats row of HeaderStatInline chips) — admin gets one extra chip
// ("Assigned") since, unlike the consultant, admin isn't implicitly the
// assignee and needs to see who is at a glance.
function HeaderCard({ sc, toggles }: { sc: Scenario; toggles: Toggles }) {
  const title = sc.projectNumber ? `${sc.projectNumber} — ${sc.address}` : sc.address;
  const status = toggles.paused ? "paused" : sc.status;
  return (
    <div className={`rounded-xl border border-zinc-200 border-l-[3px] ${STATUS_ACCENT[status]} bg-white p-5`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
        <span className="text-sm text-zinc-400">{sc.clientName}</span>
        <span className={`self-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}>
          {STATUS_LABELS[status]}
        </span>
        <span className={`self-center inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          sc.source === "email" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        }`}>
          {sc.source === "email" ? "Email" : "Portal"}
        </span>
        {toggles.override && (
          <span className="self-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Override — Payment Pending
          </span>
        )}
        {toggles.overdue && (
          <span className="self-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Overdue</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-1.5 border-t border-zinc-100 pt-3 text-sm">
        <span className="inline-flex items-center gap-1 text-zinc-500" title={`Review cycle ${sc.reviewCycle}`}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 002.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0112.888 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
          </svg>
          <span className="font-medium text-zinc-900">{sc.reviewCycle}</span>
        </span>
        <HeaderStatInline
          label="Assigned"
          value={sc.assignedName ?? "Unassigned"}
          valueClassName={sc.assignedName ? undefined : "text-amber-700"}
          noLeftBorder
        />
        <HeaderStatInline label="Submitted" value={fmtDMY(sc.createdAt)} />
        <HeaderStatInline
          label="Due"
          value={sc.dueDate ? fmtDMY(sc.dueDate) : "—"}
          valueClassName={toggles.overdue ? "text-red-600" : undefined}
        />
        <HeaderStatInline value={sc.projectNumber ? `#${sc.projectNumber}-S` : "Project number not yet set"} />
      </div>
    </div>
  );
}

// One canonical unified stage list, used by Variants A, C, D and E.
// 5 stages, not 6 — the real StageRail component (client + consultant pages)
// was only ever built and measured for 5 nodes in the 22rem left-rail
// column. An earlier pass gave admin a 6th node ("Consultant assigned")
// which overflowed the card (content 382px vs. a 350px column, clipped by
// the rail's overflow-hidden — "Delivered" got cut off). Project number and
// consultant assignment now share one "Setup" node, matching the proven
// budget; both remain independently editable via the Details tab / the
// persistent Project number & Consultant cards regardless.
function unifiedStages(sc: Scenario): Stage[] {
  const number = !!sc.projectNumber;
  const assigned = !!sc.assignedName;
  const setupDone = number && assigned;
  const pbdb = sc.pbdbVersions.length > 0;
  const allApproved = sc.reviews.length > 0 && pendingCount(sc) === 0;
  const converting = sc.status === "converting";
  const delivered = sc.status === "delivered" || sc.status === "complete";

  return [
    { id: "setup", label: "Number & consultant", icon: "number", state: setupDone ? "done" : "current" },
    { id: "pbdb", label: "PBDB generated", icon: "document", state: pbdb ? "done" : setupDone ? "current" : "upcoming" },
    {
      id: "review", label: "Stakeholder review", icon: "people",
      state: allApproved || converting || delivered ? "done" : pbdb ? "current" : "upcoming",
      urgency: sc.status === "revision_required" ? "red" : sc.status === "dispatched" ? "amber" : "neutral",
    },
    { id: "convert", label: "Converting to PBDR", icon: "refresh", state: delivered ? "done" : converting || allApproved ? "current" : "upcoming", urgency: "green" },
    { id: "delivered", label: "Delivered", icon: "flag", state: delivered ? "done" : "upcoming" },
  ];
}

// ─── Reopenable-step editors — shared by Variant D (accordion) and E (persistent cards) ──

function ProjectNumberEditor({ sc }: { sc: Scenario }) {
  const [val, setVal] = useState(sc.projectNumber ?? "");
  const [editing, setEditing] = useState(!sc.projectNumber);

  useEffect(() => {
    setVal(sc.projectNumber ?? "");
    setEditing(!sc.projectNumber);
  }, [sc.key, sc.projectNumber]);
  if (editing) {
    return (
      <div className="flex gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="24-0114" className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <button type="button" onClick={() => setEditing(false)} className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">Save</button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-zinc-900">{val}</p>
      <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-zinc-600 hover:underline">Reset</button>
    </div>
  );
}

function AssignmentEditor({ sc }: { sc: Scenario }) {
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    setReassigning(false);
  }, [sc.key]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-900">{sc.assignedName ?? "Unassigned"}</p>
          {sc.availability && <p className="text-xs capitalize text-zinc-500">{sc.availability.replace("_", " ")}</p>}
        </div>
        <button type="button" onClick={() => setReassigning((v) => !v)} className="text-xs font-medium text-zinc-600 hover:underline">
          {reassigning ? "Cancel" : "Reassign"}
        </button>
      </div>
      {reassigning && (
        <div className="flex gap-2">
          <select className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
            <option>Priya Nathan</option>
            <option>Tom Reilly</option>
            <option>Sam Okoro</option>
          </select>
          <button type="button" className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">Reassign</button>
        </div>
      )}
      {sc.assignmentHistory.length > 1 && (
        <div className="border-t border-zinc-100 pt-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">History</p>
          {sc.assignmentHistory.map((a, i) => (
            <p key={i} className="text-xs text-zinc-500">{a.name} · {fmtDMY(a.date)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// Interactive regenerate flow — idle → regenerating (spinner, ~1.1s) → done
// (new version appended, briefly highlighted "Just regenerated"). When
// !canRegen (matches real canRegeneratePbdb: only assigned/in_progress, i.e.
// before dispatch) the button renders disabled with the same copy the real
// RegeneratePbdbButton uses via its disabledMessage prop.
function PbdbRegenerateEditor({ sc, canRegen }: { sc: Scenario; canRegen: boolean }) {
  const [versions, setVersions] = useState(sc.pbdbVersions);
  const [status, setStatus] = useState<"idle" | "regenerating" | "done">("idle");

  useEffect(() => {
    setVersions(sc.pbdbVersions);
    setStatus("idle");
  }, [sc.key, sc.pbdbVersions]);

  useEffect(() => {
    if (status !== "regenerating") return;
    const t = setTimeout(() => {
      setVersions((v) => [...v, { version: v.length + 1, date: new Date().toISOString().slice(0, 10) }]);
      setStatus("done");
    }, 1100);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (status !== "done") return;
    const t = setTimeout(() => setStatus("idle"), 3000);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <div className="space-y-2">
      {versions.map((v, i) => {
        const isNew = status === "done" && i === versions.length - 1;
        return (
          <div
            key={v.version}
            className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${
              isNew ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm text-zinc-900">PBDB v{v.version}</p>
              {isNew && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  Just regenerated
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">{isNew ? "Just now" : fmtDMY(v.date)}</p>
          </div>
        );
      })}

      {canRegen ? (
        <>
          <button
            type="button"
            disabled={status === "regenerating"}
            onClick={() => setStatus("regenerating")}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "regenerating" && (
              <svg className="h-3.5 w-3.5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {status === "regenerating" ? "Regenerating…" : "Regenerate PBDB"}
          </button>
          {status !== "regenerating" && (
            <p className="text-xs text-zinc-400">Creates a new version — existing versions are kept.</p>
          )}
        </>
      ) : (
        <>
          <button type="button" disabled title="Regeneration is only available before the PBDB is dispatched to stakeholders." className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-400">
            Regenerate PBDB
          </button>
          <p className="text-xs text-zinc-400">Regeneration is only available before the PBDB is dispatched to stakeholders.</p>
        </>
      )}
    </div>
  );
}

// ─── Per-stakeholder pending row — resend / log response / update email / waive ──

// Mirrors components/UploadDropzone.tsx (real, production) closely enough to
// demonstrate the same requirement — click-to-browse, filename + green check
// once selected. No real upload; this is a mock file picker only.
function MockEvidenceDropzone({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 px-4 py-4 text-center hover:border-zinc-300 hover:bg-zinc-50/50"
    >
      <input
        ref={inputRef} type="file" className="hidden"
        accept="application/pdf,image/png,image/jpeg,image/tiff,.eml,.msg"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
            <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xs font-medium text-zinc-800">{file.name}</p>
          <p className="text-[11px] text-zinc-400">Click to attach another</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-600">
            Drop a file here or <span className="font-medium text-zinc-900 underline underline-offset-2">browse</span>
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">PDF, JPEG, PNG, TIFF, or a forwarded email (.eml/.msg)</p>
        </>
      )}
    </div>
  );
}

function StakeholderPendingRow({ r }: { r: Review }) {
  const [mode, setMode] = useState<"idle" | "logging" | "email" | "logged">("idle");
  const [outcome, setOutcome] = useState<"" | "approved" | "rejected">("");
  const [comments, setComments] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [loggedSummary, setLoggedSummary] = useState<{ outcome: "approved" | "rejected"; fileName: string } | null>(null);

  // Matches the real LogStakeholderResponseForm's canSubmit gate exactly:
  // an outcome, comments if rejecting, and evidence are all mandatory — the
  // whole point is that this record can't exist without proof attached.
  const canSubmit = !!outcome && (outcome !== "rejected" || comments.trim().length > 0) && !!evidence;

  function handleSubmit() {
    if (!canSubmit || !evidence) return;
    setLoggedSummary({ outcome: outcome as "approved" | "rejected", fileName: evidence.name });
    setMode("logged");
  }

  if (mode === "logged" && loggedSummary) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
        <p className="text-sm font-medium text-zinc-900">{r.name}</p>
        <p className="text-xs text-zinc-600">
          Logged:{" "}
          <span className="font-medium text-emerald-700">{loggedSummary.outcome === "approved" ? "Approved" : "Rejected"}</span>
          {" · "}evidence attached — <span className="italic">{loggedSummary.fileName}</span>
        </p>
      </div>
    );
  }

  if (mode === "logging") {
    return (
      <div className="space-y-2.5 rounded-md border border-amber-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-900">Log response — {r.name}</p>
          <button type="button" onClick={() => setMode("idle")} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          For stakeholders who replied by phone or email instead of using the portal. Evidence is
          required — it&apos;s the audit trail proving they reviewed the PBDB.
        </p>

        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-700">Response</span>
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="radio" name={`outcome-${r.email}`} checked={outcome === "approved"} onChange={() => setOutcome("approved")} /> Approved
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name={`outcome-${r.email}`} checked={outcome === "rejected"} onChange={() => setOutcome("rejected")} /> Rejected
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">
            Comments{" "}
            <span className="font-normal text-zinc-400">
              {outcome === "rejected" ? "(required — what needs to change)" : "(optional)"}
            </span>
          </label>
          <textarea
            value={comments} onChange={(e) => setComments(e.target.value)} rows={2}
            placeholder="What did the stakeholder say?"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
          />
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-700">
            Evidence <span className="font-normal text-zinc-400">(required)</span>
          </span>
          <MockEvidenceDropzone file={evidence} onFile={setEvidence} />
        </div>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Log response
        </button>
      </div>
    );
  }

  if (mode === "email") {
    return (
      <div className="space-y-2 rounded-md border border-amber-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-900">Update email — {r.name}</p>
          <button type="button" onClick={() => setMode("idle")} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
        </div>
        <input defaultValue={r.email} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs" />
        <p className="text-[11px] text-zinc-400">Resends a fresh approval link to the new address.</p>
        <button type="button" onClick={() => setMode("idle")} className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
          Save &amp; resend
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 bg-white px-3 py-2">
      <div className="mb-1.5 min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900">{r.name}</p>
        <p className="truncate text-xs text-zinc-500">{r.email}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Resend</button>
        <button type="button" onClick={() => setMode("logging")} className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Log response</button>
        <button type="button" onClick={() => setMode("email")} className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Update email</button>
        <button type="button" className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Waive</button>
      </div>
    </div>
  );
}

// ─── Focus card content, per scenario ───────────────────────────────────────

function AdminFocus({ sc, toggles }: { sc: Scenario; toggles: Toggles }) {
  if (toggles.paused) {
    return (
      <FocusCard tone="amber" title="Paused" subtitle="Frozen at its current stage — nothing to action.">
        <button type="button" className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Resume project
        </button>
      </FocusCard>
    );
  }
  switch (sc.key) {
    case "fresh":
      return (
        <FocusCard tone="neutral" title="Set the project number" subtitle="Unlocks PBDB generation and consultant assignment.">
          <div className="flex gap-2">
            <input defaultValue="" placeholder="24-0114" className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            <button type="button" className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">Save</button>
          </div>
        </FocusCard>
      );
    case "preparing":
      return (
        <FocusCard tone="neutral" title="Consultant is preparing the PBDB" subtitle={`Assigned to ${sc.assignedName} — nothing needed from you yet.`}>
          <button type="button" className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Generate PBDB on their behalf
          </button>
        </FocusCard>
      );
    case "readyToDispatch":
      return (
        <FocusCard tone="neutral" title="Dispatch to stakeholders" subtitle="QA complete on v1 — send it out for approval.">
          <div className="mb-3 flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
            <p className="text-sm text-zinc-900">PBDB v{sc.pbdbVersions[0].version}</p>
            <p className="text-xs text-zinc-400">{fmtDMY(sc.pbdbVersions[0].date)}</p>
          </div>
          <button type="button" className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            Dispatch to stakeholders
          </button>
        </FocusCard>
      );
    case "dispatched": {
      const pending = pendingCount(sc);
      return (
        <FocusCard tone="amber" title="Awaiting stakeholder review" subtitle={`${pending} of ${sc.reviews.length} approvals outstanding.`}>
          <div className="space-y-2">
            {sc.reviews.filter((r) => r.status === "pending").map((r) => (
              <StakeholderPendingRow key={r.email} r={r} />
            ))}
          </div>
        </FocusCard>
      );
    }
    case "revision": {
      const rejected = sc.reviews.filter((r) => r.status === "rejected");
      return (
        <FocusCard tone="red" title="Revision requested" subtitle="A stakeholder asked for changes — the consultant must upload a corrected PBDB.">
          <div className="space-y-2">
            {rejected.map((r) => (
              <div key={r.email} className="rounded-md border border-red-100 bg-red-50 px-3 py-2.5">
                <p className="text-xs font-semibold text-red-800">{r.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-red-700">{r.comments}</p>
              </div>
            ))}
          </div>
        </FocusCard>
      );
    }
    case "readyToConvert":
      return (
        <FocusCard tone="green" title="Clear the payment gate" subtitle="All stakeholders approved — convert is blocked until payment is resolved.">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-zinc-500">Credit deducted</span>
            <span className="font-medium text-zinc-500">No</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50">
              Apply override
            </button>
            <button type="button" disabled className="flex-1 rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-400">
              Convert to PBDR
            </button>
          </div>
        </FocusCard>
      );
    case "delivered":
      return (
        <FocusCard tone="green" title="Delivered" subtitle="PBDR sent to the client and delivery recipient.">
          <div className="flex items-center justify-between rounded-md border border-green-200 bg-white px-3 py-2">
            <p className="text-sm text-zinc-900">PBDR v{sc.pbdrVersions[0].version}</p>
            <button type="button" className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100">
              Resend link
            </button>
          </div>
        </FocusCard>
      );
    default:
      return null;
  }
}

// Read-only compact status card describing what the consultant is doing — used by Variant B's second rail.
function ConsultantReadout({ sc }: { sc: Scenario }) {
  const text = (() => {
    switch (sc.key) {
      case "fresh": return "Nothing yet — waiting on a project number and assignment.";
      case "preparing": return `${sc.assignedName} is generating the PBDB.`;
      case "readyToDispatch": return `${sc.assignedName} finished QA on PBDB v1.`;
      case "dispatched": return `${sc.assignedName} is waiting on stakeholder responses.`;
      case "revision": return `${sc.assignedName} needs to upload a corrected PBDB.`;
      case "readyToConvert": return `${sc.assignedName}'s work is done — blocked on the payment gate.`;
      case "delivered": return "Delivery complete.";
      default: return "";
    }
  })();
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Consultant side</p>
      {text}
    </div>
  );
}

function ControlsCard({ sc, toggles, setToggles }: { sc: Scenario; toggles: Toggles; setToggles: (t: Toggles) => void }) {
  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-zinc-900">Payment gate</h3>
        <div className="mb-2 flex gap-4 text-xs">
          <span>
            <span className="text-zinc-500">Credit deducted: </span>
            <span className={sc.creditDeducted ? "font-medium text-green-700" : "text-zinc-500"}>
              {sc.creditDeducted ? "Yes" : "No"}
            </span>
          </span>
        </div>
        {!sc.creditDeducted && (
          <button
            type="button"
            onClick={() => setToggles({ ...toggles, override: !toggles.override })}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {toggles.override ? "Reconcile override" : "Apply payment override"}
          </button>
        )}
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <h3 className="mb-1 text-sm font-semibold text-zinc-900">Delivery timing</h3>
        <p className="mb-2 text-xs text-zinc-500">Delay before the final report goes out once all approvals are in.</p>
        <select defaultValue={sc.deliveryDelayPreset} className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs">
          <option value="same_day">Same day</option>
          <option value="next_business_day">Next business day</option>
          <option value="two_business_days">2 business days</option>
        </select>
        {sc.pendingDelivery ? (
          <p className="mt-2 rounded-md bg-blue-50 px-2.5 py-2 text-[11px] leading-relaxed text-blue-700">
            Locked in — scheduled for {fmtDMY(sc.pendingDelivery)}. Changing the preset now won&apos;t affect this delivery.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">Currently: {DELAY_LABELS[sc.deliveryDelayPreset]}.</p>
        )}
      </div>

      {sc.pbdbVersions.length > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-zinc-900">Client document colour</h3>
          <p className="mb-2 text-xs text-zinc-500">Black text, or the original red token colour, on the client&apos;s PBDB download.</p>
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-xs">
            <button type="button" className="flex-1 rounded-md bg-white px-2 py-1 font-medium text-zinc-900 shadow-sm">Black text</button>
            <button type="button" className="flex-1 rounded-md px-2 py-1 font-medium text-zinc-500 hover:text-zinc-700">Red tokens</button>
          </div>
        </div>
      )}

      <div className="border-t border-zinc-100 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-900">Project controls</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setToggles({ ...toggles, paused: !toggles.paused })}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {toggles.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="flex-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Right-column pill-tab content (shared shape, reused by every variant) ──

function EditableRow({ label, value }: { label: string; value: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  useEffect(() => {
    setVal(value);
    setEditing(false);
  }, [value]);
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input value={val} onChange={(e) => setVal(e.target.value)} className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          <button type="button" onClick={() => setEditing(false)} className="shrink-0 text-xs font-medium text-zinc-700 hover:underline">Save</button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{val}</span>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-zinc-300 hover:text-zinc-600" aria-label={`Edit ${label}`}>
            <PencilIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function DetailsTab({ sc }: { sc: Scenario }) {
  return (
    <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
      <Row label="Client" value={sc.clientName} />
      <EditableRow label="Address" value={sc.address} />
      <EditableRow label="PO number" value={sc.poNumber ?? "—"} />
      <EditableRow label="Delivery recipient" value={sc.deliveryRecipient ?? "—"} />
      <Row label="Submitted via" value={sc.source === "email" ? "Email" : "Portal"} />
    </div>
  );
}

function DocumentsTab({ sc }: { sc: Scenario }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-3"><h2 className="text-sm font-semibold text-zinc-900">Submission documents</h2></div>
        {sc.submissionFiles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {sc.submissionFiles.map((f) => (
              <div key={f.name} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm text-zinc-900">{f.name}</p>
                <p className="text-xs text-zinc-400">{fmtDMY(f.date)}</p>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-zinc-100 px-5 py-3">
          <button type="button" className="text-sm font-medium text-zinc-600 hover:underline">+ Upload document</button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Evidence &amp; correspondence</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Forwarded emails, screenshots, or other proof attached to this project</p>
        </div>
        {sc.evidenceFiles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">No evidence attached yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {sc.evidenceFiles.map((f) => (
              <div key={f.ref} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm text-zinc-900">{f.ref}</p>
                <p className="text-xs text-zinc-400">{fmtDMY(f.date)}</p>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-zinc-100 px-5 py-3">
          <button type="button" className="text-sm font-medium text-zinc-600 hover:underline">+ Attach evidence</button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-3"><h2 className="text-sm font-semibold text-zinc-900">PBDB</h2></div>
        {sc.pbdbVersions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">Not yet generated.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {sc.pbdbVersions.map((v) => (
              <div key={v.version} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm text-zinc-900">PBDB v{v.version}</p>
                <p className="text-xs text-zinc-400">{fmtDMY(v.date)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-3"><h2 className="text-sm font-semibold text-zinc-900">PBDR</h2></div>
        {sc.pbdrVersions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">Not yet converted.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {sc.pbdrVersions.map((v) => (
              <div key={v.version} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-zinc-900">PBDR v{v.version}</p>
                  <p className="text-xs text-zinc-400">{fmtDMY(v.date)}</p>
                </div>
                {(sc.status === "delivered" || sc.status === "complete") && (
                  <button type="button" className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                    Resend
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StakeholdersTab({ sc }: { sc: Scenario }) {
  const statusCfg = {
    pending: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
    approved: { label: "Approved", cls: "bg-green-100 text-green-700" },
    rejected: { label: "Rejected", cls: "bg-red-100 text-red-700" },
  };
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Project stakeholders</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Overrides the template/org defaults for this project only.</p>
        </div>
        {sc.projectStakeholders.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">Using the inherited list.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {sc.projectStakeholders.map((p) => (
              <div key={p.email} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-zinc-900">{p.name}</p>
                  <p className="text-xs text-zinc-400">{p.email}{p.company ? ` · ${p.company}` : ""}</p>
                </div>
                <button type="button" className="text-xs text-zinc-400 hover:text-red-600">Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-zinc-100 px-5 py-3">
          <button type="button" className="text-sm font-medium text-zinc-600 hover:underline">+ Add stakeholder</button>
        </div>
      </div>

      {sc.reviews.length === 0 ? (
        <p className="px-1 py-4 text-sm text-zinc-400">No stakeholder reviews yet.</p>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {sc.reviews.map((r) => (
            <div key={r.email} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{r.name}</p>
                  <p className="text-xs text-zinc-500">{r.email}</p>
                  {r.comments && <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{r.comments}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg[r.status].cls}`}>
                  {statusCfg[r.status].label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-zinc-900">{value}</span>
    </div>
  );
}

function PillTabs({ tab, setTab }: { tab: string; setTab: (t: "details" | "documents" | "stakeholders") => void }) {
  const tabs: { id: "details" | "documents" | "stakeholders"; label: string }[] = [
    { id: "details", label: "Details" }, { id: "documents", label: "Documents" }, { id: "stakeholders", label: "Stakeholders" },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.id} type="button" onClick={() => setTab(t.id)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function useRefTab() {
  const [tab, setTab] = useState<"details" | "documents" | "stakeholders">("details");
  const content = (sc: Scenario) => ({ details: <DetailsTab sc={sc} />, documents: <DocumentsTab sc={sc} />, stakeholders: <StakeholdersTab sc={sc} /> }[tab]);
  return { tab, setTab, content };
}

function AuditPlaceholder() {
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">Export CSV</button>
        <button type="button" className="rounded border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">Export PDF</button>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">Audit trail (mock)</div>
    </div>
  );
}

// ─── Variant A — one track, settings pill ──────────────────────────────────

function VariantA({ sc, toggles, setToggles }: { sc: Scenario; toggles: Toggles; setToggles: (t: Toggles) => void }) {
  const { tab, setTab, content } = useRefTab();
  const [primaryTab, setPrimaryTab] = useState<"workspace" | "audit">("workspace");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <HeaderCard sc={sc} toggles={toggles} />

      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-0">
          {(["workspace", "audit"] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => setPrimaryTab(t)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                primaryTab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t === "workspace" ? "Workspace" : "Audit trail"}
            </button>
          ))}
        </nav>
      </div>

      {primaryTab === "audit" ? (
        <AuditPlaceholder />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
          <div className="min-w-0 space-y-4 md:sticky md:top-4">
            <StageRail stages={unifiedStages(sc)} />
            <AdminFocus sc={sc} toggles={toggles} />
          </div>
          <div className="min-w-0">
            <PillTabs tab={tab} setTab={setTab} />
            <div className="mt-3 space-y-3">{content(sc)}</div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed bottom-20 right-5 z-50 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Admin controls</h2>
            <button type="button" onClick={() => setSettingsOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
          </div>
          <ControlsCard sc={sc} toggles={toggles} setToggles={setToggles} />
        </div>
      )}
      <button
        type="button" onClick={() => setSettingsOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-lg hover:bg-zinc-50"
      >
        Admin controls
      </button>
    </div>
  );
}

// ─── Variant B — two tracks, admin vs consultant ───────────────────────────

function adminStages(sc: Scenario): Stage[] {
  const number = !!sc.projectNumber;
  const assigned = !!sc.assignedName;
  const ready = sc.qaCompleted && sc.pbdbVersions.length > 0;
  const dispatched = ["dispatched", "revision_required", "converting", "delivered", "complete"].includes(sc.status);
  const allApproved = sc.reviews.length > 0 && pendingCount(sc) === 0;
  const delivered = sc.status === "delivered" || sc.status === "complete";
  return [
    { id: "number", label: "Set number", icon: "number", state: number ? "done" : "current" },
    { id: "assign", label: "Assign", icon: "people", state: assigned ? "done" : number ? "current" : "upcoming" },
    { id: "dispatch", label: "Dispatch", icon: "document", state: dispatched ? "done" : ready ? "current" : "upcoming" },
    { id: "convert", label: "Convert", icon: "refresh", state: delivered ? "done" : allApproved ? "current" : "upcoming", urgency: "green" },
  ];
}

function deliveryStages(sc: Scenario): Stage[] {
  const pbdb = sc.pbdbVersions.length > 0;
  const allApproved = sc.reviews.length > 0 && pendingCount(sc) === 0;
  const delivered = sc.status === "delivered" || sc.status === "complete";
  return [
    { id: "pbdb", label: "PBDB drafted", icon: "document", state: pbdb ? "done" : sc.assignedName ? "current" : "upcoming" },
    {
      id: "review", label: "Stakeholders", icon: "people",
      state: allApproved ? "done" : pbdb ? "current" : "upcoming",
      urgency: sc.status === "revision_required" ? "red" : sc.status === "dispatched" ? "amber" : "neutral",
    },
    { id: "delivered", label: "Delivered", icon: "flag", state: delivered ? "done" : "upcoming" },
  ];
}

function VariantB({ sc, toggles, setToggles }: { sc: Scenario; toggles: Toggles; setToggles: (t: Toggles) => void }) {
  const { tab, setTab, content } = useRefTab();
  const [showAudit, setShowAudit] = useState(false);

  return (
    <div className="space-y-4">
      <HeaderCard sc={sc} toggles={toggles} />

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
        <div className="min-w-0 space-y-4 md:sticky md:top-4">
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Admin actions</p>
            <StageRail stages={adminStages(sc)} />
          </div>
          <AdminFocus sc={sc} toggles={toggles} />
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Delivery progress</p>
            <StageRail stages={deliveryStages(sc)} />
          </div>
          <ConsultantReadout sc={sc} />
          <ControlsCard sc={sc} toggles={toggles} setToggles={setToggles} />
        </div>
        <div className="min-w-0">
          <PillTabs tab={tab} setTab={setTab} />
          <div className="mt-3 space-y-3">{content(sc)}</div>
          <button type="button" onClick={() => setShowAudit((v) => !v)} className="mt-6 text-sm font-medium text-zinc-500 hover:text-zinc-700">
            {showAudit ? "Hide" : "Show"} audit trail →
          </button>
          {showAudit && <div className="mt-3"><AuditPlaceholder /></div>}
        </div>
      </div>
    </div>
  );
}

// ─── Variant C — one track, permanent controls card ────────────────────────

function VariantC({ sc, toggles, setToggles }: { sc: Scenario; toggles: Toggles; setToggles: (t: Toggles) => void }) {
  const { tab, setTab, content } = useRefTab();
  const [showAudit, setShowAudit] = useState(false);

  return (
    <div className="space-y-4">
      <HeaderCard sc={sc} toggles={toggles} />

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
        <div className="min-w-0 space-y-4 md:sticky md:top-4">
          <StageRail stages={unifiedStages(sc)} />
          <AdminFocus sc={sc} toggles={toggles} />
          <ControlsCard sc={sc} toggles={toggles} setToggles={setToggles} />
        </div>
        <div className="min-w-0">
          <PillTabs tab={tab} setTab={setTab} />
          <div className="mt-3 space-y-3">{content(sc)}</div>
          <button type="button" onClick={() => setShowAudit((v) => !v)} className="mt-6 text-sm font-medium text-zinc-500 hover:text-zinc-700">
            {showAudit ? "Hide" : "Show"} audit trail →
          </button>
          {showAudit && <div className="mt-3"><AuditPlaceholder /></div>}
        </div>
      </div>
    </div>
  );
}

// ─── Local rail with pencil badges + click-to-expand (Variant D only) ──────

const NODE_ICON_PATHS: Record<string, string> = {
  document: "M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm7 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 9a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6z",
  people: "M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.106-.31.18-.632.217-.964a4.978 4.978 0 00-1.056-3.79 6.487 6.487 0 013.63 1.55.998.998 0 01.35.98A5.006 5.006 0 0114.5 16z",
  refresh: "M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 002.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0112.888 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z",
  flag: "M2.75 2a.75.75 0 01.75.75v.372a3.75 3.75 0 011.5-.372h1.628c.646 0 1.28.198 1.813.567a2.25 2.25 0 001.281.383h2.809a.75.75 0 01.75.75v6.75a.75.75 0 01-.75.75h-2.81a2.25 2.25 0 01-1.28-.383 2.25 2.25 0 00-1.284-.317H5a2.25 2.25 0 00-2.25 2.25v2.5a.75.75 0 01-1.5 0V2.75A.75.75 0 012.75 2z",
};

function EditableStageRail({ stages, editable, openId, onToggle }: {
  stages: Stage[]; editable: Set<string>; openId: string | null; onToggle: (id: string) => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 px-6 py-5">
      <div className="flex items-start">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1;
          const isEditable = editable.has(stage.id);
          const isOpen = openId === stage.id;
          const node = (
            <div className="relative flex flex-col items-center gap-2">
              {stage.state === "done" ? (
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-200 ${isOpen ? "ring-[3px] ring-zinc-400" : ""}`}>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : stage.state === "current" ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm ring-[5px] ring-zinc-200">
                  {stage.icon === "number" ? <span className="text-xs font-semibold">{i + 1}</span> : (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d={NODE_ICON_PATHS[stage.icon]} clipRule="evenodd" /></svg>
                  )}
                </div>
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-white text-zinc-300">
                  {stage.icon === "number" ? <span className="text-xs font-semibold">{i + 1}</span> : (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d={NODE_ICON_PATHS[stage.icon]} clipRule="evenodd" /></svg>
                  )}
                </div>
              )}
              {isEditable && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-zinc-100 text-zinc-500 shadow-sm">
                  <PencilIcon className="h-2.5 w-2.5" />
                </span>
              )}
              <span className={`max-w-[6.5rem] text-center text-[11px] font-medium leading-tight ${
                stage.state === "upcoming" ? "text-zinc-400" : stage.state === "current" ? "text-zinc-900" : "text-zinc-700"
              }`}>
                {stage.label}
              </span>
            </div>
          );
          return (
            <div key={stage.id} className={`flex items-start ${isLast ? "" : "flex-1"}`}>
              {isEditable ? (
                <button type="button" onClick={() => onToggle(stage.id)} className="rounded-lg transition-transform hover:scale-[1.03]" aria-expanded={isOpen}>
                  {node}
                </button>
              ) : node}
              {!isLast && (
                <div className="mt-[18px] mx-1.5 h-[3px] flex-1 rounded-full bg-zinc-100">
                  <div className={`h-full rounded-full ${stage.state === "done" ? "w-full bg-emerald-400" : "w-0"}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Variant D — click-to-expand rail badges ───────────────────────────────

const PANEL_TITLES: Record<string, string> = { setup: "Project number & consultant", pbdb: "PBDB versions" };

function VariantD({ sc, toggles, setToggles }: { sc: Scenario; toggles: Toggles; setToggles: (t: Toggles) => void }) {
  const { tab, setTab, content } = useRefTab();
  const [primaryTab, setPrimaryTab] = useState<"workspace" | "audit">("workspace");
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const stages = unifiedStages(sc);
  const canRegen = canRegenPbdb(sc);
  const editable = new Set<string>();
  stages.forEach((s) => {
    if (s.state !== "done") return;
    if (s.id === "setup") editable.add(s.id);
    // Reopenable even when regeneration is currently disabled, so the
    // disabled state (with its explanation) is reachable, not just implied.
    if (s.id === "pbdb") editable.add(s.id);
  });

  return (
    <div className="space-y-4">
      <HeaderCard sc={sc} toggles={toggles} />
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-0">
          {(["workspace", "audit"] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => setPrimaryTab(t)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                primaryTab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t === "workspace" ? "Workspace" : "Audit trail"}
            </button>
          ))}
        </nav>
      </div>

      {primaryTab === "audit" ? (
        <AuditPlaceholder />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
          <div className="min-w-0 space-y-4 md:sticky md:top-4">
            <div>
              <EditableStageRail stages={stages} editable={editable} openId={openPanel} onToggle={(id) => setOpenPanel((p) => (p === id ? null : id))} />
              {editable.size > 0 && <p className="mt-1.5 px-1 text-[11px] text-zinc-400">Steps with a pencil badge can be reopened.</p>}
            </div>
            {openPanel && (
              <div className="rounded-lg border border-zinc-300 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900">{PANEL_TITLES[openPanel]}</h3>
                  <button type="button" onClick={() => setOpenPanel(null)} className="text-zinc-400 hover:text-zinc-600" aria-label="Close">✕</button>
                </div>
                {openPanel === "setup" && (
                  <div className="space-y-4">
                    <ProjectNumberEditor sc={sc} />
                    <div className="border-t border-zinc-100 pt-3">
                      <AssignmentEditor sc={sc} />
                    </div>
                  </div>
                )}
                {openPanel === "pbdb" && <PbdbRegenerateEditor sc={sc} canRegen={canRegen} />}
              </div>
            )}
            <AdminFocus sc={sc} toggles={toggles} />
            <ControlsCard sc={sc} toggles={toggles} setToggles={setToggles} />
          </div>
          <div className="min-w-0">
            <PillTabs tab={tab} setTab={setTab} />
            <div className="mt-3 space-y-3">{content(sc)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings pill — matches app/(consultant)/ops/projects/[id]/_components/SettingsPill.tsx ──
// Same fixed-bottom-right button + slide-up popover, same click-outside/Escape
// handling. Renamed "Settings" here since it now carries payment/pause/delete
// too, not just delivery config.

function SettingsPill({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {open && (
        <div
          ref={popoverRef}
          className="fixed bottom-20 right-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Settings</h2>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600" aria-label="Close">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          <div className="space-y-4">{children}</div>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-lg hover:bg-zinc-50"
      >
        <svg className="h-4 w-4 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567l-.091.549a.798.798 0 01-.517.608 7.45 7.45 0 00-.478.198.798.798 0 01-.796-.064l-.453-.324a1.875 1.875 0 00-2.416.2l-.243.243a1.875 1.875 0 00-.2 2.416l.324.453a.798.798 0 01.064.796 7.448 7.448 0 00-.198.478.798.798 0 01-.608.517l-.55.092a1.875 1.875 0 00-1.566 1.849v.344c0 .916.663 1.699 1.567 1.85l.549.091c.281.047.508.25.608.517.06.163.127.323.198.478a.798.798 0 01-.064.796l-.324.453a1.875 1.875 0 00.2 2.416l.243.243c.648.648 1.67.733 2.416.2l.453-.324a.798.798 0 01.796-.064c.155.071.315.138.478.198.267.1.47.327.517.608l.092.55c.15.903.932 1.566 1.849 1.566h.344c.916 0 1.699-.663 1.85-1.567l.091-.549a.798.798 0 01.517-.608 7.52 7.52 0 00.478-.198.798.798 0 01.796.064l.453.324a1.875 1.875 0 002.416-.2l.243-.243c.648-.648.733-1.67.2-2.416l-.324-.453a.798.798 0 01-.064-.796c.071-.155.138-.315.198-.478.1-.267.327-.47.608-.517l.55-.091a1.875 1.875 0 001.566-1.85v-.344c0-.916-.663-1.699-1.567-1.85l-.549-.091a.798.798 0 01-.608-.517 7.507 7.507 0 00-.198-.478.798.798 0 01.064-.796l.324-.453a1.875 1.875 0 00-.2-2.416l-.243-.243a1.875 1.875 0 00-2.416-.2l-.453.324a.798.798 0 01-.796.064 7.462 7.462 0 00-.478-.198.798.798 0 01-.517-.608l-.091-.55a1.875 1.875 0 00-1.85-1.566h-.344zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
            clipRule="evenodd"
          />
        </svg>
        Settings
      </button>
    </>
  );
}

// ─── Variant E — always-visible edit cards ─────────────────────────────────

function VariantE({ sc, toggles, setToggles }: { sc: Scenario; toggles: Toggles; setToggles: (t: Toggles) => void }) {
  const { tab, setTab, content } = useRefTab();
  const [primaryTab, setPrimaryTab] = useState<"workspace" | "audit">("workspace");
  const canRegen = canRegenPbdb(sc);

  return (
    <div className="space-y-4">
      <HeaderCard sc={sc} toggles={toggles} />
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-0">
          {(["workspace", "audit"] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => setPrimaryTab(t)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                primaryTab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t === "workspace" ? "Workspace" : "Audit trail"}
            </button>
          ))}
        </nav>
      </div>

      {primaryTab === "audit" ? (
        <AuditPlaceholder />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
          <div className="min-w-0 space-y-4 md:sticky md:top-4">
            <StageRail stages={unifiedStages(sc)} />
            <AdminFocus sc={sc} toggles={toggles} />
            {sc.projectNumber && (
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Project number</p>
                <ProjectNumberEditor sc={sc} />
              </div>
            )}
            {sc.assignedName && (
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Consultant</p>
                <AssignmentEditor sc={sc} />
              </div>
            )}
            {canRegen && (
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">PBDB</p>
                <PbdbRegenerateEditor sc={sc} canRegen={canRegen} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <PillTabs tab={tab} setTab={setTab} />
            <div className="mt-3 space-y-3">{content(sc)}</div>
          </div>
        </div>
      )}

      <SettingsPill>
        <ControlsCard sc={sc} toggles={toggles} setToggles={setToggles} />
      </SettingsPill>
    </div>
  );
}

// ─── Scenario switcher (dev-only) ───────────────────────────────────────────

function ScenarioBar({ scenario, setScenario, toggles, setToggles }: {
  scenario: string; setScenario: (k: string) => void; toggles: Toggles; setToggles: (t: Toggles) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Scenario</span>
      <select
        value={scenario} onChange={(e) => setScenario(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700"
      >
        {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-zinc-600">
        <input type="checkbox" checked={toggles.overdue} onChange={(e) => setToggles({ ...toggles, overdue: e.target.checked })} />
        Overdue
      </label>
      <label className="flex items-center gap-1.5 text-sm text-zinc-600">
        <input type="checkbox" checked={toggles.override} onChange={(e) => setToggles({ ...toggles, override: e.target.checked })} />
        Payment override applied
      </label>
      <label className="flex items-center gap-1.5 text-sm text-zinc-600">
        <input type="checkbox" checked={toggles.paused} onChange={(e) => setToggles({ ...toggles, paused: e.target.checked })} />
        Paused
      </label>
    </div>
  );
}

// ─── Switcher + page shell ──────────────────────────────────────────────────

const VARIANTS = [
  { key: "A", name: "One track, settings pill", Component: VariantA },
  { key: "B", name: "Two tracks — admin vs consultant", Component: VariantB },
  { key: "C", name: "One track, permanent controls card", Component: VariantC },
  { key: "D", name: "Click-to-expand rail badges", Component: VariantD },
  { key: "E", name: "Always-visible edit cards", Component: VariantE },
] as const;

function PrototypeSwitcher({ current, onChange }: { current: string; onChange: (key: string) => void }) {
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const cycle = (delta: number) => onChange(VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (t?.isContentEditable) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const label = VARIANTS[idx];
  return (
    <div className="fixed bottom-5 left-1/2 z-[999] flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-2 text-white shadow-xl">
      <button type="button" onClick={() => cycle(-1)} className="rounded-full px-2 py-1 text-sm hover:bg-zinc-700">←</button>
      <span className="whitespace-nowrap text-xs font-medium">{label.key} — {label.name}</span>
      <button type="button" onClick={() => cycle(1)} className="rounded-full px-2 py-1 text-sm hover:bg-zinc-700">→</button>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "D";
  const active = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
  const Component = active.Component;

  const [scenarioKey, setScenarioKey] = useState("dispatched");
  const [toggles, setToggles] = useState<Toggles>({ overdue: false, override: false, paused: false });
  const sc = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0];

  function setVariant(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", key);
    router.replace(`/prototype-admin-projectdetail?${params.toString()}`);
  }

  return (
    <div className="min-h-[100vh] bg-zinc-50 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-sm text-zinc-500">← Projects</p>
        <ScenarioBar scenario={scenarioKey} setScenario={setScenarioKey} toggles={toggles} setToggles={setToggles} />
        <Component sc={sc} toggles={toggles} setToggles={setToggles} />
      </div>
      {process.env.NODE_ENV !== "production" && <PrototypeSwitcher current={active.key} onChange={setVariant} />}
    </div>
  );
}
