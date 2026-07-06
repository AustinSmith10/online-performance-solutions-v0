"use client";

import { useState } from "react";

type Tab = "overview" | "admin_workflow" | "consultant_workflow" | "controls" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "admin_workflow", label: "Admin Workflow" },
  { id: "consultant_workflow", label: "Consultant Workflow" },
  { id: "controls", label: "Controls" },
  { id: "audit", label: "Audit trail" },
];

export function AdminProjectTabs({
  initialTab = "overview",
  overview,
  adminWorkflow,
  consultantWorkflow,
  controls,
  audit,
}: {
  initialTab?: Tab;
  overview: React.ReactNode;
  adminWorkflow: React.ReactNode;
  consultantWorkflow: React.ReactNode;
  controls: React.ReactNode;
  audit: React.ReactNode;
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
        {tab === "overview"
          ? overview
          : tab === "consultant_workflow"
          ? consultantWorkflow
          : tab === "admin_workflow"
          ? adminWorkflow
          : tab === "audit"
          ? audit
          : controls}
      </div>
    </div>
  );
}
