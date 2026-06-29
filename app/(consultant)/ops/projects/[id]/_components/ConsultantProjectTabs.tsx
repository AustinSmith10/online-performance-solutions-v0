"use client";

import { useState } from "react";

type Tab = "steps" | "info";

export function ConsultantProjectTabs({
  info,
  steps,
}: {
  info: React.ReactNode;
  steps: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("steps");

  return (
    <div className="space-y-6">
      {/* Tab bar — hidden at lg+ where both columns show */}
      <div className="consultant-tabs-bar flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
        <button
          type="button"
          onClick={() => setTab("steps")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "steps"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Steps
        </button>
        <button
          type="button"
          onClick={() => setTab("info")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "info"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Project info
        </button>
      </div>

      {/* Grid: 1 col on mobile (only active tab visible), 2 col on desktop (both visible) */}
      <div className="consultant-two-col">
        <div className={`space-y-4 ${tab === "steps" ? "consultant-tab-hidden" : ""}`}>{info}</div>
        <div className={`space-y-3 ${tab === "info" ? "consultant-tab-hidden" : ""}`}>{steps}</div>
      </div>
    </div>
  );
}
