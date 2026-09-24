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

  // Arrow keys / Home / End move between tabs (ARIA tab pattern); the
  // selected tab is the only one in the tab order.
  function onTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = REF_TABS.findIndex((t) => t.id === refTab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % REF_TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + REF_TABS.length) % REF_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = REF_TABS.length - 1;
    else return;
    e.preventDefault();
    requestNavigate(() => setRefTab(REF_TABS[next].id));
    document.getElementById(`ref-tab-${REF_TABS[next].id}`)?.focus();
  }

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
          <div role="tablist" aria-label="Project reference" onKeyDown={onTabKeyDown} className="flex gap-1 rounded-lg bg-zinc-100 p-1">
            {REF_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`ref-tab-${t.id}`}
                aria-selected={refTab === t.id}
                aria-controls="ref-tabpanel"
                tabIndex={refTab === t.id ? 0 : -1}
                onClick={() => requestNavigate(() => setRefTab(t.id))}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium press-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                  refTab === t.id
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div key={refTab} role="tabpanel" id="ref-tabpanel" aria-labelledby={`ref-tab-${refTab}`} className="pane-in mt-4 space-y-4">{refContent[refTab]}</div>
        </div>
      </div>
    </div>
  );
}
