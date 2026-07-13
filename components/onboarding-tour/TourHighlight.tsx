"use client";

import { useTourTarget } from "./context";

export function TourHighlight({ id, children }: { id: string; children: React.ReactNode }) {
  const active = useTourTarget(id);
  return (
    <div
      data-tour-target={id}
      className={active ? "rounded-lg ring-2 ring-blue-500 ring-offset-2 transition-all" : ""}
    >
      {children}
    </div>
  );
}
