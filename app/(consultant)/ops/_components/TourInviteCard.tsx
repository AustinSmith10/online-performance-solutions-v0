"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { markOnboardingStepSeen } from "@/app/actions/onboarding";

export function TourInviteCard() {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) return null;

  function skip() {
    setDismissed(true);
    startTransition(() => {
      markOnboardingStepSeen("consultant_tour");
    });
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-blue-900">New here?</h2>
          <p className="mt-1 text-sm text-blue-800">
            Take a two-minute guided tour of how jobs flow through — from picking up work to
            handing it off.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={skip} className="text-xs font-medium text-blue-700 hover:underline">
            Skip
          </button>
          <Link
            href="/ops?tour=1"
            className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            Take the tour →
          </Link>
        </div>
      </div>
    </div>
  );
}
