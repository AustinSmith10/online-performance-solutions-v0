"use client";

import { useEffect, useRef, useState } from "react";

interface DownloadCardProps {
  /** Signed URL or API route. If falsy, the card renders as a static (non-downloadable) row. */
  href?: string | null;
  /** Sets the `download` attribute — only honoured by same-origin links. */
  filename?: string | null;
  /** project_files.original_filename — shown in muted text beneath the alias/label. */
  originalFilename?: string | null;
  /** Extra classes for the originalFilename text — use to cap its width so long names truncate. */
  filenameClassName?: string;
  /** The alias/label + any secondary meta line(s) for the left side of the card. */
  children?: React.ReactNode;
  buttonLabel?: string;
  buttonClassName?: string;
  /** Opens in a new tab (used for signed URLs that aren't forced to download server-side). */
  external?: boolean;
  wrapperClassName?: string;
  id?: string;
}

const CONFIRM_DELAY_MS = 1500;
const FADE_DELAY_MS = 2000;
const POLL_MS = 200;
// Upper bound on how long the wash spinner waits for real progress before
// falling back to the fixed-timer confirm — covers a status endpoint that's
// unreachable, or a download id the streaming route never saw (dl stripped,
// process instance mismatch, etc).
const MAX_WASH_MS = 20000;

// Only the streamed download routes (#125 pbdb, #129 pbdr) report
// bytes-served progress, each via its own sibling status route. Other hrefs
// (signed URLs to storage, other internal routes) keep the original
// fixed-timer wash below.
const TRACKABLE_DOWNLOAD_PREFIXES = ["/api/download/pbdb/", "/api/download/pbdr/"];

function trackableStatusPrefix(href: string): string | null {
  const prefix = TRACKABLE_DOWNLOAD_PREFIXES.find(
    (p) => href.startsWith(p) && !href.startsWith(`${p}status/`)
  );
  return prefix ? `${prefix}status/` : null;
}

interface DownloadStatusResponse {
  bytesServed: number;
  totalBytes: number | null;
  done: boolean;
}

const DEFAULT_BUTTON_CLASS =
  "shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50";
const DEFAULT_WRAPPER_CLASS = "flex items-center justify-between gap-3 px-5 py-3";

export function DownloadCard({
  href,
  filename,
  originalFilename,
  filenameClassName = "",
  children,
  buttonLabel = "Download",
  buttonClassName = DEFAULT_BUTTON_CLASS,
  external,
  wrapperClassName = DEFAULT_WRAPPER_CLASS,
  id,
}: DownloadCardProps) {
  const [phase, setPhase] = useState<"idle" | "wash" | "confirmed">("idle");
  const [downloaded, setDownloaded] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  function clearPendingTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function finishWash() {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
    clearPendingTimers();
    setPhase("confirmed");
    timers.current.push(setTimeout(() => setPhase("idle"), FADE_DELAY_MS));
  }

  function pollDownloadStatus(statusPrefix: string, dl: string) {
    setPct(0);
    const poll = async () => {
      try {
        const res = await fetch(`${statusPrefix}${dl}`, { cache: "no-store" });
        if (!res.ok && res.status !== 404) return;
        const data = (await res.json()) as DownloadStatusResponse;
        if (data.totalBytes) {
          setPct(Math.min(100, Math.round((data.bytesServed / data.totalBytes) * 100)));
        }
        if (data.done) {
          setPct(100);
          finishWash();
        }
      } catch {
        // Best-effort — a failed poll just leaves the wash spinner running
        // until MAX_WASH_MS's fallback below fires.
      }
    };
    poll();
    pollInterval.current = setInterval(poll, POLL_MS);
    timers.current.push(setTimeout(finishWash, MAX_WASH_MS));
  }

  function handleClick() {
    setDownloaded(true);
    setPhase("wash");
    setPct(null);

    const statusPrefix = href ? trackableStatusPrefix(href) : null;
    if (statusPrefix && anchorRef.current) {
      const dl =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Mutate this same anchor's href synchronously, before the browser
      // processes this click's default navigation — still one real user
      // gesture on the original element, unlike building/clicking a new <a>
      // asynchronously from a fetched blob (see GeneratedPbdbDownload.tsx's
      // comment on why that pattern silently drops downloads in some
      // browsers). React won't fight this: since the `href` prop itself is
      // unchanged, a later re-render (triggered by the state updates below)
      // has nothing to reconcile back over this attribute.
      const url = new URL(anchorRef.current.href, window.location.origin);
      url.searchParams.set("dl", dl);
      anchorRef.current.href = `${url.pathname}${url.search}`;
      pollDownloadStatus(statusPrefix, dl);
      return;
    }

    // Non-trackable hrefs (external signed URLs, other routes) keep the
    // original fixed-timer wash.
    timers.current.push(
      setTimeout(() => setPhase("confirmed"), CONFIRM_DELAY_MS),
      setTimeout(() => setPhase("idle"), CONFIRM_DELAY_MS + FADE_DELAY_MS)
    );
  }

  return (
    <div id={id} className={`relative overflow-hidden rounded-md ${wrapperClassName}`}>
      {href && phase !== "idle" && (
        <div
          className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-1.5 transition-colors duration-500 ${
            phase === "wash" ? "bg-green-100/70" : "bg-green-100"
          }`}
        >
          {phase === "wash" ? (
            <>
              <svg className="h-4 w-4 animate-spin text-green-600" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z"
                />
              </svg>
              {pct !== null && <span className="text-sm font-medium text-green-700">{pct}%</span>}
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Downloaded
            </span>
          )}
        </div>
      )}

      {(children || originalFilename) && (
        <div className="relative min-w-0 flex-1">
          {children}
          {originalFilename && (
            <p className={`mt-0.5 truncate text-[11px] text-zinc-400 ${filenameClassName}`}>
              {originalFilename}
            </p>
          )}
        </div>
      )}

      <div className="relative flex shrink-0 items-center gap-2">
        {href && downloaded && (
          <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            Downloaded ✓
          </span>
        )}
        {href && (
          <a
            ref={anchorRef}
            href={href}
            download={filename ?? undefined}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            onClick={handleClick}
            className={buttonClassName}
          >
            {buttonLabel}
          </a>
        )}
      </div>
    </div>
  );
}
