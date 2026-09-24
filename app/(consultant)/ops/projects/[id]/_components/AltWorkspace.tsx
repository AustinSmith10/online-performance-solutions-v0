"use client";

import { useState } from "react";
import { UnsavedChangesProvider, useRequestNavigate } from "@/components/UnsavedChangesProvider";
import type { Stage } from "@/components/workspace/StageRail";
import { StageRail } from "@/components/workspace/StageRail";
import { SettingsPill } from "./SettingsPill";

type PrimaryTab = "workspace" | "audit";
type RefTab = "details" | "documents" | "stakeholders";

const PRIMARY_IDS = ["workspace", "audit"] as const;
const REF_IDS = ["details", "documents", "stakeholders"] as const;

const REF_TABS: { id: RefTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "documents", label: "Documents" },
  { id: "stakeholders", label: "Stakeholders" },
];

/** Arrow/Home/End keys move between tabs (WAI-ARIA tabs pattern). */
function onTabListKeyDown<T extends string>(
  e: React.KeyboardEvent<HTMLElement>,
  ids: readonly T[],
  current: T,
  select: (id: T) => void,
  prefix: string,
) {
  const i = ids.indexOf(current);
  let next: number | null = null;
  if (e.key === "ArrowRight") next = (i + 1) % ids.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + ids.length) % ids.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = ids.length - 1;
  if (next === null) return;
  e.preventDefault();
  select(ids[next]);
  document.getElementById(`${prefix}-tab-${ids[next]}`)?.focus();
}

export function AltWorkspace(props: {
  header: React.ReactNode;
  stages: Stage[];
  focusCard: React.ReactNode;
  leftRailExtras?: React.ReactNode;
  detailsTab: React.ReactNode;
  documentsTab: React.ReactNode;
  stakeholdersTab: React.ReactNode;
  settingsContent: React.ReactNode;
  settingsTitle?: string;
  auditTab: React.ReactNode;
  defaultRefTab?: RefTab;
}) {
  return (
    <UnsavedChangesProvider>
      <AltWorkspaceInner {...props} />
    </UnsavedChangesProvider>
  );
}

function AltWorkspaceInner({
  header,
  stages,
  focusCard,
  leftRailExtras,
  detailsTab,
  documentsTab,
  stakeholdersTab,
  settingsContent,
  settingsTitle,
  auditTab,
  defaultRefTab = "details",
}: {
  header: React.ReactNode;
  stages: Stage[];
  focusCard: React.ReactNode;
  leftRailExtras?: React.ReactNode;
  detailsTab: React.ReactNode;
  documentsTab: React.ReactNode;
  stakeholdersTab: React.ReactNode;
  settingsContent: React.ReactNode;
  settingsTitle?: string;
  auditTab: React.ReactNode;
  defaultRefTab?: RefTab;
}) {
  const [tab, setTab] = useState<PrimaryTab>("workspace");
  const [refTab, setRefTab] = useState<RefTab>(defaultRefTab);
  const requestNavigate = useRequestNavigate();

  const refContent: Record<RefTab, React.ReactNode> = {
    details: detailsTab,
    documents: documentsTab,
    stakeholders: stakeholdersTab,
  };

  return (
    <div className="space-y-4">
      {header}

      <div className="border-b border-zinc-200">
        <div
          role="tablist"
          aria-label="Project sections"
          className="-mb-px flex gap-0"
          onKeyDown={(e) =>
            onTabListKeyDown(e, PRIMARY_IDS, tab, (id) => requestNavigate(() => setTab(id)), "primary")
          }
        >
          {(
            [
              { id: "workspace" as const, label: "Workspace" },
              { id: "audit" as const, label: "Audit trail" },
            ]
          ).map((t) => (
            <button
              key={t.id}
              id={`primary-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="primary-panel"
              tabIndex={tab === t.id ? 0 : -1}
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
        </div>
      </div>

      <div
        id="primary-panel"
        role="tabpanel"
        aria-labelledby={`primary-tab-${tab}`}
      >
      {tab === "audit" ? (
        auditTab
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[25rem_1fr]">
          {/* Left rail: whole workflow state, stays visible while the right column scrolls */}
          <div className="min-w-0 space-y-4 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto md:p-1 md:-m-1">
            <StageRail stages={stages} />
            {focusCard}
            {leftRailExtras}
          </div>

          {/* Right column: reference tabs, gets the width the old stacked layout wasted.
              min-w-0 stops long unbreakable values (e.g. Trustee Entity) from forcing the
              grid track — and the whole page — wider than the container. */}
          <div className="min-w-0">
            <div
              role="tablist"
              aria-label="Reference"
              className="flex gap-1 rounded-lg bg-zinc-100 p-1"
              onKeyDown={(e) =>
                onTabListKeyDown(e, REF_IDS, refTab, (id) => requestNavigate(() => setRefTab(id)), "ref")
              }
            >
              {REF_TABS.map((t) => (
                <button
                  key={t.id}
                  id={`ref-tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={refTab === t.id}
                  aria-controls="ref-panel"
                  tabIndex={refTab === t.id ? 0 : -1}
                  onClick={() => requestNavigate(() => setRefTab(t.id))}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    refTab === t.id
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:bg-white/60 hover:text-zinc-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div
              key={refTab}
              id="ref-panel"
              role="tabpanel"
              aria-labelledby={`ref-tab-${refTab}`}
              className="pane-in mt-3 space-y-3"
            >
              {refContent[refTab]}
            </div>
          </div>

          <SettingsPill title={settingsTitle}>{settingsContent}</SettingsPill>
        </div>
      )}
      </div>
    </div>
  );
}
