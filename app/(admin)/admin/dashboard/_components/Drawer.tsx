"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  projectId: string;
  anchorId?: string;
  children: React.ReactNode;
}

export function Drawer({ isOpen, onClose, title, subtitle, projectId, anchorId, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Focus trap — move focus into the panel on open
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  const projectHref = anchorId
    ? `/admin/projects/${projectId}#${anchorId}`
    : `/admin/projects/${projectId}`;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />

      {/* Centered modal */}
      <div
        className={[
          "fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "flex w-full max-w-lg flex-col bg-white shadow-2xl outline-none rounded-xl",
          "max-h-[90vh]",
          "transform transition-transform duration-200 ease-out",
          isOpen ? "scale-100" : "scale-95",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">{title}</p>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="mt-0.5 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer — link to full project */}
        <div className="border-t border-zinc-100 px-5 py-3">
          <Link
            href={projectHref}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            Open full project profile →
          </Link>
        </div>
      </div>
      </div>
    </>
  );
}
