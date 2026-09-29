import type { Stage } from "@/components/workspace/StageRail";

// Pre-submission rail state — mirrors lib/delivery/stepper.ts's DEFAULT_STAGES
// labels exactly so the rail a client sees while filling out the intake form
// is the same rail (just all-upcoming) they'll see once the project exists.
export const REQUEST_STAGES: Stage[] = [
  { id: "submitted", label: "Submitted", icon: "document", state: "current", urgency: "neutral" },
  { id: "prepared", label: "Being prepared", icon: "refresh", state: "upcoming" },
  { id: "review", label: "Awaiting your review", icon: "people", state: "upcoming" },
  { id: "finalizing", label: "Finalizing", icon: "refresh", state: "upcoming" },
  { id: "delivered", label: "Delivered", icon: "flag", state: "upcoming" },
];

// Same rail for staff submitting on a client's behalf (admin/consultant),
// except the review stage — "your review" doesn't make sense when the
// viewer isn't the one being asked to review, and staff surfaces already
// call this stage "Awaiting Approval" (see STATUS_LABELS) once the project
// exists, so this stays consistent with what they'll see next.
export const REQUEST_STAGES_STAFF: Stage[] = REQUEST_STAGES.map((s) =>
  s.id === "review" ? { ...s, label: "Awaiting approval" } : s
);
