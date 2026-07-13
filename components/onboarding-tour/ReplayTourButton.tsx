"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { REPLAY_TOUR_EVENT } from "./context";

// Same page as the tour lives on: just reset it client-side, no reload.
// Any other page: fall back to a normal navigation with ?tour=replay.
export function ReplayTourButton({ href, className }: { href: string; className?: string }) {
  const pathname = usePathname();

  if (pathname === href) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(REPLAY_TOUR_EVENT))}
        className={className}
      >
        How this works
      </button>
    );
  }

  return (
    <Link href={`${href}?tour=replay`} className={className}>
      How this works
    </Link>
  );
}
