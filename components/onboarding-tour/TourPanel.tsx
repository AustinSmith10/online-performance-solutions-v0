"use client";

import { useLayoutEffect, useState } from "react";
import type { TourStepConfig } from "@/lib/onboarding/steps";

const PANEL_WIDTH = 288;
const MARGIN = 16;

export function TourPanel({
  step,
  index,
  total,
  onNext,
  onSkip,
}: {
  step: TourStepConfig;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  // Anchor the panel right next to whatever it's currently spotlighting —
  // a fixed bottom-right panel makes the eye jump between the ring and the
  // explanation every step. Falls back to a fixed spot for steps with no
  // real target (the intro step).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      const el = document.querySelector(`[data-tour-target="${step.id}"]`) as HTMLElement | null;
      if (!el) {
        setPos(null);
        return;
      }
      const r = el.getBoundingClientRect();
      let left = Math.min(r.left, window.innerWidth - PANEL_WIDTH - MARGIN);
      left = Math.max(left, MARGIN);
      let top = r.bottom + 10;
      if (top + 180 > window.innerHeight) top = Math.max(r.top - 172, MARGIN);
      setPos({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step.id]);

  return (
    <div
      className={`fixed z-50 w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-xl transition-all duration-150 ${
        pos ? "" : "bottom-4 right-4"
      }`}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-blue-500" : "bg-zinc-200"}`}
          />
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-900">{step.title}</p>
      <p className="mt-1 text-sm text-zinc-600">{step.text}</p>
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={onSkip} className="text-xs text-zinc-500 hover:underline">
          Skip
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700"
        >
          {index === total - 1 ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
