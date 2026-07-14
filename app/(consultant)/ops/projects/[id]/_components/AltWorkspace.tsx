"use client";

import { useState } from "react";
import { UnsavedChangesProvider, useRequestNavigate } from "@/components/UnsavedChangesProvider";
import type { Stage } from "./StageRail";
import { StageRail } from "./StageRail";
import { SettingsPill } from "./SettingsPill";

type PrimaryTab = "workspace" | "audit";
type RefTab = "details" | "documents" | "stakeholders";

const REF_TABS: { id: RefTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "documents", label: "Documents" },
  { id: "stakeholders", label: "Stakeholders" },
];

export function AltWorkspace(props: {
  header: React.ReactNode;
  stages: Stage[];
  focusCard: React.ReactNode;
  leftRailExtras?: React.ReactNode;
  detailsTab: React.ReactNode;
  documentsTab: React.ReactNode;
  stakeholdersTab: React.ReactNode;
  settingsContent: React.ReactNode;
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
        <nav className="-mb-px flex gap-0">
          {(
            [
              { id: "workspace" as const, label: "Workspace" },
              { id: "audit" as const, label: "Audit trail" },
            ]
          ).map((t) => (
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

      {tab === "audit" ? (
        auditTab
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[22rem_1fr]">
          {/* Left rail: whole workflow state, stays visible while the right column scrolls */}
          <div className="min-w-0 space-y-4 md:sticky md:top-4">
            <StageRail stages={stages} />
            {focusCard}
            {leftRailExtras}
          </div>

          {/* Right column: reference tabs, gets the width the old stacked layout wasted.
              min-w-0 stops long unbreakable values (e.g. Trustee Entity) from forcing the
              grid track — and the whole page — wider than the container. */}
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

          <SettingsPill>{settingsContent}</SettingsPill>
        </div>
      )}
    </div>
  );
}
