import type { StepperResult, StepperStage } from "@/lib/delivery/stepper";

export function StepperIcon({ name, className }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "check":
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "file-text":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M9 13h6M9 17h6" />
        </svg>
      );
    case "package":
      return (
        <svg {...common}>
          <path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="M3.27 6.96 12 12l8.73-5.04M12 22.08V12" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 0 1-15.3 6.4M3 12a9 9 0 0 1 15.3-6.4M21 3v6h-6M3 21v-6h6" />
        </svg>
      );
    case "message-circle":
      return (
        <svg {...common}>
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      );
    case "player-pause":
      return (
        <svg {...common}>
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      );
    default:
      return null;
  }
}

export const STEPPER_CIRCLE_STYLES: Record<StepperStage["visual"], string> = {
  complete: "bg-green-600 border-green-600 text-white",
  current: "bg-blue-600 border-blue-600 text-white",
  upcoming: "bg-white border-zinc-300 text-zinc-400",
  "revision-current": "bg-blue-600 border-blue-600 text-white",
  "revision-pending": "bg-amber-50 border-amber-400 text-amber-700",
};

export const STEPPER_LABEL_STYLES: Record<StepperStage["visual"], string> = {
  complete: "text-zinc-900",
  current: "text-zinc-900 font-medium",
  upcoming: "text-zinc-400",
  "revision-current": "text-zinc-900 font-medium",
  "revision-pending": "text-zinc-900",
};

export function stepperActiveIndexOf(stages: StepperStage[]): number {
  const idx = stages.findIndex((s) => s.visual === "current" || s.visual === "revision-current");
  if (idx !== -1) return idx;
  const lastComplete = stages.map((s) => s.visual).lastIndexOf("complete");
  return lastComplete === -1 ? 0 : lastComplete;
}

// Whether the stakeholder — not the consultant — is the one who needs to act right now.
// True for the "Awaiting your review" stage whenever it's the active one, whether that's a
// plain first-pass review or the amber mid-revision "revision-pending" circle.
export function stepperNeedsStakeholderAction(stage: StepperStage): boolean {
  return stage.key === "review" && (stage.visual === "current" || stage.visual === "revision-pending");
}

// Short, single-word circle captions for compact contexts (list-row mini-stepper), distinct
// from the full canonical wording (StepperStage.label) used on the project detail page.
const SHORT_STAGE_LABELS: Record<StepperStage["key"], string> = {
  submitted: "Submitted",
  prepared: "Prepared",
  review: "Review",
  finalizing: "Finalizing",
  delivered: "Delivered",
};

function shortStageLabel(stage: StepperStage): string {
  return stage.visual === "revision-current" ? "Revising" : SHORT_STAGE_LABELS[stage.key];
}

const SHORT_BADGE_LABELS: Record<StepperStage["key"], string> = {
  submitted: "Submitted",
  prepared: "In progress",
  review: "Awaiting review",
  finalizing: "Finalizing",
  delivered: "Delivered",
};

// Derives a compact status pill straight from the stepper's active stage, so a row's badge
// always matches its mini-stepper's current circle — amber marks "stakeholder needs to act",
// blue marks "we're working on it", green marks done. No separate palette to drift out of sync.
export function stepperBadge(result: StepperResult): { label: string; className: string } {
  if (result.isPaused) return { label: "On hold", className: "bg-amber-100 text-amber-700" };
  const activeStage = result.stages[stepperActiveIndexOf(result.stages)];
  const label = activeStage.visual === "revision-current" ? "Revising" : SHORT_BADGE_LABELS[activeStage.key];
  const className =
    activeStage.visual === "complete"
      ? "bg-green-100 text-green-700"
      : stepperNeedsStakeholderAction(activeStage)
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";
  return { label, className };
}

// Compact stepper used inline (e.g. an expanded list row) where the caption/round badge
// is already shown by the caller — this renders only the circle row + loop-back arrow.
export function MiniStepper({
  stages,
  showRevisionLoop,
}: {
  stages: StepperStage[];
  showRevisionLoop: boolean;
}) {
  const activeIndex = stepperActiveIndexOf(stages);
  const trackFillPct = (activeIndex / (stages.length - 1)) * 80;

  return (
    <div className="max-w-xl">
      <div className="relative flex justify-between">
        <div className="absolute top-[13px] left-[8%] right-[8%] h-0.5 bg-zinc-300" />
        <div
          className="absolute top-[13px] left-[8%] h-0.5 bg-green-600"
          style={{ width: `${trackFillPct}%` }}
        />
        {stages.map((stage) => {
          // A plain "current" review stage (first-pass dispatch) gets the same amber/
          // message-circle treatment as the mid-revision "revision-pending" circle —
          // both mean "the stakeholder needs to act", so they should look identical.
          const isActiveReview = stepperNeedsStakeholderAction(stage) && stage.visual === "current";
          const visual = isActiveReview ? "revision-pending" : stage.visual;
          const icon = isActiveReview ? "message-circle" : stage.visual === "complete" ? "check" : stage.icon;

          return (
            <div key={stage.key} className="relative z-10 flex w-1/5 flex-col items-center gap-1.5">
              <div
                className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border ${STEPPER_CIRCLE_STYLES[visual]}`}
              >
                <StepperIcon name={icon} className="h-3.5 w-3.5" />
              </div>
              <span className={`text-center text-[11px] leading-snug ${STEPPER_LABEL_STYLES[visual]}`}>
                {shortStageLabel(stage)}
              </span>
            </div>
          );
        })}
      </div>

      {showRevisionLoop && (
        <div className="relative h-6">
          <svg
            viewBox="0 0 100 36"
            preserveAspectRatio="none"
            className="absolute top-0 h-8 w-1/5"
            style={{ left: "30%" }}
            aria-hidden="true"
          >
            <path
              d="M 100 4 C 100 30, 0 30, 0 4"
              fill="none"
              stroke="#B45309"
              strokeWidth="1.5"
              markerEnd="url(#mini-stepper-loop-arrow)"
            />
            <defs>
              <marker
                id="mini-stepper-loop-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="3"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 z" fill="#B45309" />
              </marker>
            </defs>
          </svg>
        </div>
      )}
    </div>
  );
}
