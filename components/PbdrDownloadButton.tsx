"use client";

import { useState } from "react";

type Phase = "idle" | "preparing" | "done";

export function PbdrDownloadButton({
  href,
  filename,
  label = "Download",
  className = "shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50",
}: {
  href: string;
  filename?: string;
  label?: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  function handleClick() {
    setPhase("preparing");
    setTimeout(() => setPhase("done"), 1800);
    setTimeout(() => setPhase("idle"), 4000);
  }

  return (
    <div className="flex items-center gap-2">
      <a href={href} download={filename} onClick={handleClick} className={className}>
        {label}
      </a>
      {phase === "preparing" && (
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          Preparing download…
        </span>
      )}
      {phase === "done" && (
        <span className="flex items-center gap-1.5 text-xs text-green-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          Downloaded
        </span>
      )}
    </div>
  );
}
