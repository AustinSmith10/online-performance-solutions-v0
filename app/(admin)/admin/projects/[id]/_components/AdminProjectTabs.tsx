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
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div>
        {tab === "overview" ? overview : tab === "workflow" ? workflow : controls}
      </div>
    </div>
  );
}
