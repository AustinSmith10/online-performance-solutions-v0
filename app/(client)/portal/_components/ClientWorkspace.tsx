"use client";

import { useState } from "react";
import { UnsavedChangesProvider, useRequestNavigate } from "@/components/UnsavedChangesProvider";
import type { Stage } from "@/components/workspace/StageRail";
import { StageRail } from "@/components/workspace/StageRail";

// Client-facing counterpart to the consultant's AltWorkspace
// (app/(consultant)/ops/projects/[id]/_components/AltWorkspace.tsx) — same
// StageRail + FocusCard + pill-tab shape, minus the audit tab and settings
// pill the client doesn't need. Used by both /portal/submit (the intake
// step) and /portal/projects/[id] (the ongoing project) so a client never
// sees a change of visual language between "requesting" and "having" a
// report — only the tab content changes.

export type RefTab = "overview" | "documents" | "review";

const REF_TABS: { id: RefTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "review", label: "Review" },
];

export function ClientWorkspace(props: {
  header: React.ReactNode;
  stages: Stage[];
  focusCard: React.ReactNode;
  leftRailExtras?: React.ReactNode;
  overviewTab: React.ReactNode;
  documentsTab: React.ReactNode;
  reviewTab: React.ReactNode;
  defaultRefTab?: RefTab;
}) {
  return (
    <UnsavedChangesProvider>
      <ClientWorkspaceInner {...props} />
    </UnsavedChangesProvider>
  );
}

function ClientWorkspaceInner({
  header,
  stages,
  focusCard,
  leftRailExtras,
  overviewTab,
  documentsTab,
  reviewTab,
  defaultRefTab = "overview",
}: {
  header: React.ReactNode;
  stages: Stage[];
  focusCard: React.ReactNode;
  leftRailExtras?: React.ReactNode;
  overviewTab: React.ReactNode;
  documentsTab: React.ReactNode;
  reviewTab: React.ReactNode;
  defaultRefTab?: RefTab;
}) {
  const [refTab, setRefTab] = useState<RefTab>(defaultRefTab);
  const requestNavigate = useRequestNavigate();

  const refContent: Record<RefTab, React.ReactNode> = {
    overview: overviewTab,
    documents: documentsTab,
    review: reviewTab,
  };

  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
        {/* Left rail: whole project state, stays visible while the right column scrolls */}
        <div className="min-w-0 space-y-4 md:sticky md:top-4">
          <StageRail stages={stages} />
          {focusCard}
          {leftRailExtras}
        </div>

        {/* Right column: reference tabs */}
        <div className="min-w-0">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
            {REF_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => requestNavigate(() => setRefTab(t.id))}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  refTab === t.id
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-3">{refContent[refTab]}</div>
        </div>
      </div>
    </div>
  );
}
