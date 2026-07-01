"use client";

import { useState } from "react";

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  headerExtra,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          <svg
            className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>
      {open && <div className="border-t border-zinc-100">{children}</div>}
    </div>
  );
}
