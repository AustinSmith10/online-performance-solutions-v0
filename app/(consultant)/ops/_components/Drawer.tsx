"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useModalFocus } from "./useModalFocus";
import { ModalPortal } from "@/components/ModalPortal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  projectId: string;
  children: React.ReactNode;
}

export function Drawer({ isOpen, onClose, title, subtitle, projectId, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useModalFocus(isOpen, panelRef, onClose);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <ModalPortal>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm ease-[var(--ease-out)]",
          // Only the closing state transitions `visibility`: the opening style must flip it
          // instantly, otherwise the panel is still hidden when focus moves in.
          isOpen ? "visible opacity-100 transition-opacity duration-200" : "pointer-events-none invisible opacity-0 transition-[opacity,visibility] duration-150",
        ].join(" ")}
      />

      <div
        className={[
          "fixed inset-0 z-50 flex items-center justify-center p-4 ease-[var(--ease-out)]",
          isOpen ? "visible opacity-100 transition-opacity duration-200" : "pointer-events-none invisible opacity-0 transition-[opacity,visibility] duration-150",
        ].join(" ")}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={[
            "flex w-full max-w-lg flex-col bg-white shadow-[0_8px_30px_rgb(0_0_0/0.10)] outline-none rounded-xl",
            "max-h-[90vh]",
            "transform transition-transform ease-[var(--ease-out)] motion-reduce:transition-none",
            isOpen ? "scale-100 duration-200" : "scale-95 duration-150 motion-reduce:scale-100",
          ].join(" ")}
        >
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
              className="press mt-0.5 shrink-0 rounded p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>

          <div className="border-t border-zinc-100 px-5 py-3">
            <Link
              href={`/ops/projects/${projectId}`}
              onClick={onClose}
              className="press inline-flex items-center gap-1.5 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Open full project profile →
            </Link>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
