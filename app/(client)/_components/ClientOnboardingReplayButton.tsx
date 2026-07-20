"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLIENT_ONBOARDING_REPLAY_EVENT } from "../portal/_components/ClientOnboardingBanner";

// Mirrors components/onboarding-tour/ReplayTourButton.tsx's pattern: same
// page as the banner lives on (always /portal) just re-shows it client-side
// with no reload; any other page falls back to a normal navigation.
export function ClientOnboardingReplayButton() {
  const pathname = usePathname();
  const label = "How this works";

  if (pathname === "/portal") {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(CLIENT_ONBOARDING_REPLAY_EVENT))}
        title={label}
        aria-label={label}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 text-xs font-semibold text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
      >
        ?
      </button>
    );
  }

  return (
    <Link
      href="/portal?onboarding=replay"
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 text-xs font-semibold text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
    >
      ?
    </Link>
  );
}
