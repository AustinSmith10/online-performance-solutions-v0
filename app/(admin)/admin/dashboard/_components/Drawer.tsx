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
  successMessage?: string;
  children: React.ReactNode;
}

export function Drawer({ isOpen, onClose, title, subtitle, projectId, anchorId, successMessage, children }: Props) {
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

  // Auto-close after success
  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [successMessage, onClose]);

  const projectHref = anchorId
    ? `/admin/projects/${projectId}#${anchorId}`
    : `/admin/projects/${projectId}`;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={successMessage ? undefined : onClose}
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
            "relative flex w-full max-w-lg flex-col bg-white shadow-2xl outline-none rounded-xl overflow-hidden",
            "max-h-[90vh]",
            "transform transition-transform duration-200 ease-out",
            isOpen ? "scale-100" : "scale-95",
          ].join(" ")}
        >
          {/* Success overlay */}
          {successMessage && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white px-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 ring-1 ring-green-200">
                <svg className="h-8 w-8 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <div>
                <p className="text-base font-semibold text-zinc-900">Done</p>
                <p className="mt-1 text-sm text-zinc-500">{successMessage}</p>
              </div>
            </div>
          )}

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
