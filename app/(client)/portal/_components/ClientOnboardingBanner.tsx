"use client";

// First-run intro banner for the client portal (issue #94), deliberately
// thinner than the consultant/admin onboarding tour (#90): one static
// banner, not a multi-step guided tour — see docs/agents context on #94 for
// the scoping rationale. Dismissal persists via has_seen_client_onboarding
// (a single boolean, not the onboarding_steps_seen array #90 uses).

// Same-page "replay" click dispatches this instead of navigating, so the
// header's "?" button doesn't force a reload when already on /portal.
export const CLIENT_ONBOARDING_REPLAY_EVENT = "client-onboarding-replay";

export function ClientOnboardingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-900">How your report works</p>
          <p className="mt-0.5 text-sm text-blue-700">
            This is where you&apos;ll submit a request. Once it&apos;s ready, you&apos;ll review and
            approve it before the final report is delivered.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
