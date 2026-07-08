import type { StepperResult } from "@/lib/delivery/stepper";
import {
  StepperIcon as Icon,
  STEPPER_CIRCLE_STYLES as CIRCLE_STYLES,
  STEPPER_LABEL_STYLES as LABEL_STYLES,
  stepperActiveIndexOf,
} from "@/components/delivery/StepperVisuals";

export function DeliveryStepper({ result }: { result: StepperResult }) {
  const { stages, showRevisionLoop, isPaused, roundBadge, caption } = result;
  const activeIndex = stepperActiveIndexOf(stages);
  const trackFillPct = (activeIndex / (stages.length - 1)) * 80;

  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-5 ${isPaused ? "opacity-60" : ""}`}>
      {isPaused ? (
        <div className="mb-5 flex items-center gap-1.5 text-sm text-zinc-500">
          <Icon name="player-pause" className="h-3.5 w-3.5" />
          <span>On hold</span>
        </div>
      ) : (
        <div className="mb-5 flex items-center gap-2">
          <p className="text-sm text-zinc-500">{caption}</p>
          {roundBadge && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Round {roundBadge}
            </span>
          )}
        </div>
      )}

      <div className="relative flex justify-between">
        <div className="absolute top-4 left-[10%] right-[10%] h-0.5 bg-zinc-300" />
        <div
          className="absolute top-4 left-[10%] h-0.5 bg-green-600"
          style={{ width: `${trackFillPct}%` }}
        />
        {stages.map((stage) => (
          <div key={stage.key} className="relative z-10 flex w-1/5 flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border ${CIRCLE_STYLES[stage.visual]}`}
            >
              <Icon name={stage.visual === "complete" ? "check" : stage.icon} className="h-4 w-4" />
            </div>
            <span className={`mt-2 text-center text-xs ${LABEL_STYLES[stage.visual]}`}>
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      {showRevisionLoop && (
        <div className="relative mt-1 h-9">
          <svg
            viewBox="0 0 100 36"
            preserveAspectRatio="none"
            className="absolute top-0 h-11 w-1/5"
            style={{ left: "30%" }}
            aria-hidden="true"
          >
            <path
              d="M 100 4 C 100 30, 0 30, 0 4"
              fill="none"
              stroke="#B45309"
              strokeWidth="1.5"
              markerEnd="url(#delivery-stepper-loop-arrow)"
            />
            <defs>
              <marker
                id="delivery-stepper-loop-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="3.5"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L7,3.5 L0,7 z" fill="#B45309" />
              </marker>
            </defs>
          </svg>
          <span className="absolute top-5 left-[38%] whitespace-nowrap text-[11px] text-amber-700">
            loops back
          </span>
        </div>
      )}
    </div>
  );
}
