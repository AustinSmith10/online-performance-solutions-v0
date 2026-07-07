"use client";

import { useState } from "react";
import { UnsavedChangesProvider, useRequestNavigate } from "@/components/UnsavedChangesProvider";

type Tab = "overview" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "audit", label: "Audit trail" },
];

export function ConsultantProjectTabs(props: {
  overview: React.ReactNode;
  audit: React.ReactNode;
}) {
  return (
    <UnsavedChangesProvider>
      <ConsultantProjectTabsInner {...props} />
    </UnsavedChangesProvider>
  );
}

function ConsultantProjectTabsInner({
  overview,
  audit,
}: {
  overview: React.ReactNode;
  audit: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const requestNavigate = useRequestNavigate();

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => requestNavigate(() => setTab(t.id))}
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
      <div>{tab === "overview" ? overview : audit}</div>
    </div>
  );
}
