"use client";

import { useState } from "react";

type Tab = "overview" | "workflow" | "controls";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "workflow", label: "Workflow" },
  { id: "controls", label: "Controls" },
];

export function AdminProjectTabs({
  initialTab = "overview",
  overview,
  workflow,
  controls,
}: {
  initialTab?: Tab;
  overview: React.ReactNode;
  workflow: React.ReactNode;
  controls: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === "overview" ? overview : tab === "workflow" ? workflow : controls}
      </div>
    </div>
  );
}
