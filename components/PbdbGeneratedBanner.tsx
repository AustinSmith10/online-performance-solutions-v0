"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// This page's realtime subscription (RealtimeRefresh) calls router.refresh()
// on any projects-table change, sometimes within a second or two — no
// filter on which project. A multi-second setTimeout choreography here
// risks getting interrupted mid-sequence, so the spotlight is applied
// immediately on mount instead of after a delay, and the sessionStorage
// guard below stops a refresh-triggered remount from restarting it.
const shownKey = (cleanUrl: string) => `pbdb-generated-shown:${cleanUrl}`;

export function PbdbGeneratedBanner({ cleanUrl }: { cleanUrl: string }) {
  const router = useRouter();
  // Pure read only — React 18 Strict Mode double-invokes state initializers
  // in dev to catch impurities, so a setItem() here would fire twice and the
  // second call would see its own first write, making this always resolve
  // to "already shown" and silently never render.
  const [alreadyShown] = useState(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem(shownKey(cleanUrl)) === "1";
  });
  const [visible, setVisible] = useState(!alreadyShown);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (alreadyShown) return;
    sessionStorage.setItem(shownKey(cleanUrl), "1");

    const el = document.getElementById("pbdb-section");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // rAF, not a synchronous setState in the effect body — lets the browser
    // commit the scroll before we measure, and the callback form is the
    // "external system" pattern the set-state-in-effect lint rule wants.
    const raf = el ? requestAnimationFrame(() => setSpotlightRect(el.getBoundingClientRect())) : null;

    const t = setTimeout(() => {
      setVisible(false);
      setSpotlightRect(null);
      router.replace(cleanUrl, { scroll: false });
    }, 4500);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [alreadyShown, cleanUrl, router]);

  const dismiss = () => {
    setVisible(false);
    setSpotlightRect(null);
    router.replace(cleanUrl, { scroll: false });
  };

  return (
    <>
      {spotlightRect && (
        <>
          <div
            className="pointer-events-none fixed z-40 animate-pulse rounded-lg ring-2 ring-green-400 ring-offset-2"
            style={{
              top: spotlightRect.top - 4,
              left: spotlightRect.left - 4,
              width: spotlightRect.width + 8,
              height: spotlightRect.height + 8,
            }}
          />
          <div
            className="pointer-events-none fixed z-40 flex justify-center"
            style={{ top: spotlightRect.top - 26, left: spotlightRect.left, width: spotlightRect.width }}
          >
            <svg
              className="h-5 w-5 animate-bounce text-green-500 drop-shadow-sm"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 9l7 7 7-7" />
            </svg>
          </div>
        </>
      )}
      {visible && (
        <div className="fixed right-4 top-20 z-50 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
              <svg className="h-4 w-4 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900">PBDB generated</p>
              <p className="mt-0.5 text-xs text-zinc-500">Ready to download — highlighted below.</p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="shrink-0 text-zinc-400 hover:text-zinc-600"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
