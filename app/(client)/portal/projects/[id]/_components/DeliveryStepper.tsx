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
        {showRevisionLoop && (
          <div
            className="absolute rounded-2xl bg-amber-50"
            style={{ top: "-6px", left: "20%", width: "40%", height: "62px" }}
            aria-hidden="true"
          />
        )}
        <div className="absolute top-4 left-[10%] right-[10%] h-0.5 bg-zinc-300" />
        <div
          className="absolute top-4 left-[10%] h-0.5 bg-green-600"
          style={{ width: `${trackFillPct}%` }}
        />
        {showRevisionLoop && (
          <div
            className="absolute z-20 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-amber-200 px-1 text-amber-800"
            style={{ top: "-10px", left: "58%" }}
          >
            {roundBadge ? (
              <span className="text-[11px] font-semibold leading-none">{roundBadge}</span>
            ) : (
              <Icon name="refresh" className="h-3 w-3" />
            )}
          </div>
        )}
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
    </div>
  );
}
