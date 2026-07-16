"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setOwnAvailability } from "@/app/actions/consultant";
import { AVAILABILITY_OPTIONS } from "@/lib/consultant/availability-options";
import type { ConsultantAvailability } from "@/types";

// Floating pill for the consultant's own availability status — same idiom as
// the "Delivery Config" SettingsPill on the project-detail page
// (app/(consultant)/ops/projects/[id]/_components/SettingsPill.tsx). Anchored
// bottom-left (SettingsPill is bottom-right) so the two don't collide on
// project-detail pages. Persisted in the consultant layout so it's reachable
// from every page instead of a dedicated /availability nav item.
export function AvailabilityPill({ current }: { current: ConsultantAvailability }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const currentOption = AVAILABILITY_OPTIONS.find((o) => o.value === current) ?? AVAILABILITY_OPTIONS[0];

  function choose(value: ConsultantAvailability) {
    if (value === current) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await setOwnAvailability(value);
      setOpen(false);
    });
  }

  return (
    <>
      {open && (
        <div
          ref={popoverRef}
          className="fixed bottom-20 left-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Availability</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          <p className="mb-3 text-xs text-zinc-500">
            Visible to Admins when they assign projects. Update it whenever your capacity changes.
          </p>
          <div className="space-y-2">
            {AVAILABILITY_OPTIONS.map((opt) => {
              const isActive = opt.value === current;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isActive || pending}
                  onClick={() => choose(opt.value)}
                  className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "border-zinc-900 bg-zinc-900 text-white cursor-default"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
                  }`}
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${opt.dotClassName}`} />
                  <span>
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className={`mt-0.5 block text-xs ${isActive ? "text-zinc-300" : "text-zinc-500"}`}>
                      {opt.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-lg hover:bg-zinc-50"
      >
        <span className={`h-2 w-2 rounded-full ${currentOption.dotClassName}`} />
        {pending ? "Updating…" : currentOption.label}
      </button>
    </>
  );
}
