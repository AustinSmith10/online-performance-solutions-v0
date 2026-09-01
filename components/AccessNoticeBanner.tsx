"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Dismissible banner explaining why the user landed here instead of where
 * they clicked (#177). `proxy.ts` redirects cross-portal / wrong-role page
 * requests to the user's own portal with `?notice=wrong-area` rather than a
 * bare redirect that reads as "OPS is broken".
 *
 * Renders nothing when there's no recognised notice. Must sit under a
 * <Suspense> boundary (it calls useSearchParams).
 */
const NOTICES: Record<string, string> = {
  "wrong-area": "You don't have access to that area, so we brought you back to your own workspace.",
  "signed-out": "You've been signed out. Sign in again to pick up where you left off.",
};

export function AccessNoticeBanner() {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const [dismissed, setDismissed] = useState(false);

  const message = notice ? NOTICES[notice] : undefined;
  if (!message || dismissed) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
        <p className="text-sm text-amber-800">{message}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded px-2 text-sm text-amber-500 hover:bg-amber-100 hover:text-amber-700"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
