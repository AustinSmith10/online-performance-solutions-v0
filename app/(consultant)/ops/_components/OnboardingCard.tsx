"use client";

import { useState, useTransition } from "react";
import { markOnboardingStepSeen } from "@/app/actions/onboarding";

const STEPS = [
  {
    title: "Pick up or accept a job",
    text: "Unclaimed jobs live under \"Available jobs\"; anything an admin assigns you shows up highlighted in Active with inline Accept/Decline.",
  },
  {
    title: "Set the project number, generate the PBDB, then QA it",
    text: "All three happen from the project page — set the number, generate, download and QA it, then upload the QA'd copy to dispatch to stakeholders.",
  },
  {
    title: "Track review under \"With stakeholders\"",
    text: "No action needed while it's out for review — a stakeholder requesting changes moves it back to Active with your revision notes.",
  },
  {
    title: "Approval finalises and delivers automatically",
    text: "Once every stakeholder has approved, the report is finalised and delivered without you having to do anything else.",
  },
];

export function OnboardingCard() {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) return null;

  function gotIt() {
    setDismissed(true);
    startTransition(() => {
      markOnboardingStepSeen("consultant_tour");
    });
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold text-blue-900">How jobs flow through</h2>
        <button
          type="button"
          onClick={gotIt}
          className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          Got it
        </button>
      </div>
      <ol className="mt-3 space-y-2.5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-semibold text-blue-800">
              {i + 1}
            </span>
            <p className="text-sm text-blue-800">
              <span className="font-medium">{step.title}.</span> {step.text}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
