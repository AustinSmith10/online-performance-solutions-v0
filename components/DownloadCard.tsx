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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
    };
  }, []);

  function handleClick() {
    setDownloaded(true);
    setPhase("wash");
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
            <svg className="h-4 w-4 animate-spin text-green-600" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
              <path
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z"
              />
            </svg>
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
