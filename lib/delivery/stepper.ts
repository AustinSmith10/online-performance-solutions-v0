import type { ProjectStatus } from "@/types";

export type StepperStageKey = "submitted" | "prepared" | "review" | "finalizing" | "delivered";

export type StepperStageVisual =
  | "complete"
  | "current"
  | "upcoming"
  | "revision-current"
  | "revision-pending";

export interface StepperStage {
  key: StepperStageKey;
  label: string;
  icon: string;
  visual: StepperStageVisual;
}

export interface StepperInput {
  status: ProjectStatus;
  pausedPreviousStatus: ProjectStatus | null;
  reviewCycle: number;
  pbdbDownloadedAt: string | null;
  showConsultantName: boolean;
  consultantFirstName: string | null;
  viewerFirstName: string | null;
}

export interface StepperResult {
  stages: StepperStage[];
  showRevisionLoop: boolean;
  isPaused: boolean;
  roundBadge: number | null;
  caption: string;
}

const DEFAULT_STAGES: Omit<StepperStage, "visual">[] = [
  { key: "submitted", label: "Submitted", icon: "check" },
  { key: "prepared", label: "Being prepared", icon: "clock" },
  { key: "review", label: "Awaiting your review", icon: "eye" },
  { key: "finalizing", label: "Finalizing", icon: "file-text" },
  { key: "delivered", label: "Delivered", icon: "package" },
];

// Index into DEFAULT_STAGES that each underlying status resolves to.
// `revision_required` resolves to the "prepared" position (it's a loop-back, not a 6th stage).
const STAGE_INDEX: Partial<Record<ProjectStatus, number>> = {
  submitted: 0,
  assigned: 1,
  in_progress: 1,
  revision_required: 1,
  dispatched: 2,
  converting: 4,
  delivered: 4,
  complete: 4,
};

export function resolveStepperState(input: StepperInput): StepperResult {
  const effectiveStatus =
    input.status === "paused" ? input.pausedPreviousStatus ?? input.status : input.status;

  const activeIndex = STAGE_INDEX[effectiveStatus] ?? 0;
  // `converting` renders as stage 5 in its in-progress (not yet complete) state.
  const activeIsComplete = effectiveStatus === "delivered" || effectiveStatus === "complete";

  const stages: StepperStage[] = DEFAULT_STAGES.map((stage, index) => ({
    ...stage,
    visual: (index < activeIndex
      ? "complete"
      : index === activeIndex
        ? activeIsComplete
          ? "complete"
          : "current"
        : "upcoming") as StepperStageVisual,
  }));

  const showRevisionLoop = effectiveStatus === "revision_required";
  if (showRevisionLoop) {
    stages[1] = { ...stages[1], visual: "revision-current", label: "Revising", icon: "refresh" };
    stages[2] = { ...stages[2], visual: "revision-pending", icon: "message-circle" };
  }

  return {
    stages,
    showRevisionLoop,
    isPaused: input.status === "paused",
    roundBadge: input.reviewCycle > 1 ? input.reviewCycle : null,
    caption: captionFor(effectiveStatus, input),
  };
}

function captionFor(status: ProjectStatus, input: StepperInput): string {
  if (status === "submitted") return "Your request has been submitted";

  if (status === "assigned" || status === "in_progress") {
    const consultantName =
      input.showConsultantName && input.consultantFirstName ? input.consultantFirstName : null;

    if (input.reviewCycle > 1) {
      return consultantName
        ? `${consultantName} is applying your changes`
        : "Your changes are being applied";
    }
    if (input.pbdbDownloadedAt) {
      return consultantName
        ? `${consultantName} is working on your report`
        : "Your report is being prepared";
    }
    return consultantName
      ? `${consultantName} is assessing your request`
      : "Your request is being assessed";
  }

  if (status === "dispatched") {
    return input.viewerFirstName
      ? `${input.viewerFirstName}, please review the brief`
      : "Please review the brief";
  }

  if (status === "converting") return "Finalizing your report";

  if (status === "revision_required") {
    const consultantName =
      input.showConsultantName && input.consultantFirstName ? input.consultantFirstName : null;
    return consultantName
      ? `${consultantName} will review your comments and make the appropriate changes`
      : "Consultant will review your comments and make the appropriate changes";
  }

  if (status === "delivered" || status === "complete") {
    return input.viewerFirstName
      ? `${input.viewerFirstName}, the PBDR is ready for download`
      : "The PBDR is ready for download";
  }

  return "";
}
