"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { REPLAY_TOUR_EVENT } from "./context";

// Same page as the tour lives on: just reset it client-side, no reload.
// Any other page: fall back to a normal navigation with ?tour=replay.
// `children` overrides the default text label — e.g. an icon for a compact
// nav bar — but the accessible name ("How this works") stays put via title/aria-label.
export function ReplayTourButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const label = "How this works";

  if (pathname === href) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(REPLAY_TOUR_EVENT))}
        className={className}
        title={label}
        aria-label={label}
      >
        {children ?? label}
      </button>
    );
  }

  return (
    <Link href={`${href}?tour=replay`} className={className} title={label} aria-label={label}>
      {children ?? label}
    </Link>
  );
}
