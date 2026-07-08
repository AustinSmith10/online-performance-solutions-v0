"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MiniStepper,
  stepperBadge,
  stepperActiveIndexOf,
  stepperNeedsStakeholderAction,
} from "@/components/delivery/StepperVisuals";
import { DownloadPbdrLink } from "./DownloadPbdrLink";
import type { StepperResult } from "@/lib/delivery/stepper";

// Purely visual — the whole card toggles expansion, this chevron is just an indicator, not its own button.
function ChevronIndicator({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function statusCaption(stepper: StepperResult | null): string | null {
  if (!stepper) return null;
  return stepper.isPaused ? "On hold" : stepper.caption || null;
}

// Ties the caption's color to the same status the badge is showing (amber when the
// stakeholder needs to act, green once delivered/complete, blue while work is in progress)
// so the two never visually disagree.
function captionClassName(stepper: StepperResult | null): string {
  if (!stepper || stepper.isPaused) return "text-zinc-500";
  const activeStage = stepper.stages[stepperActiveIndexOf(stepper.stages)];
  if (stepperNeedsStakeholderAction(activeStage)) return "font-medium text-amber-700";
  if (activeStage.visual === "complete") return "text-green-700";
  return "text-blue-700";
}

interface RowProps {
  href: string;
  label: string;
  statusLabel: string;
  statusClassName: string;
  stepper: StepperResult | null;
  submittedLabel: string;
  expectedDeliveryLabel: string | null;
  isDelivered: boolean;
  projectId: string;
  pbdrFilename?: string;
}

export function ProjectCard({
  href,
  label,
  statusLabel,
  statusClassName,
  stepper,
  submittedLabel,
  expectedDeliveryLabel,
  isDelivered,
  projectId,
  pbdrFilename,
}: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const caption = statusCaption(stepper);
  const badge = stepper ? stepperBadge(stepper) : { label: statusLabel, className: statusClassName };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        aria-expanded={stepper ? expanded : undefined}
        onClick={() => stepper && setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-900 leading-snug">{label}</p>
            {caption && <p className={`mt-0.5 text-xs ${captionClassName(stepper)}`}>{caption}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                {badge.label}
              </span>
              {stepper?.roundBadge && (
                <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Round {stepper.roundBadge}
                </span>
              )}
              {stepper && <ChevronIndicator expanded={expanded} />}
            </div>
            <p className="whitespace-nowrap text-xs text-zinc-500">
              Submitted {submittedLabel}
              {expectedDeliveryLabel ? ` · Expected ${expectedDeliveryLabel}` : " · No delivery date set"}
            </p>
          </div>
        </div>
      </button>
      {expanded && stepper && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <MiniStepper stages={stepper.stages} showRevisionLoop={stepper.showRevisionLoop} />
        </div>
      )}
      {isDelivered && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <DownloadPbdrLink projectId={projectId} filename={pbdrFilename} />
        </div>
      )}
      <div className="mt-2.5 border-t border-zinc-100 pt-2.5">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          Details
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
