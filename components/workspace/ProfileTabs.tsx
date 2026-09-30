"use client";

import { useState } from "react";
import { TabBar } from "@/components/TabBar";
import { UnsavedChangesProvider, useRequestNavigate } from "@/components/UnsavedChangesProvider";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function ProfileTabs({
  header,
  tabs,
}: {
  header: React.ReactNode;
  tabs: Tab[];
}) {
  return (
    <UnsavedChangesProvider>
      <ProfileTabsInner header={header} tabs={tabs} />
    </UnsavedChangesProvider>
  );
}

function ProfileTabsInner({ header, tabs }: { header: React.ReactNode; tabs: Tab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const requestNavigate = useRequestNavigate();
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="space-y-4">
      {header}
      <div>
        <TabBar
          tabs={tabs.map((t) => ({ id: t.id, label: t.label }))}
          active={active?.id}
          onSelect={(id) => requestNavigate(() => setActiveId(id))}
          idPrefix="profile"
          label="Sections"
        />
        <div
          key={active?.id}
          id="profile-panel"
          role="tabpanel"
          aria-labelledby={active ? `profile-tab-${active.id}` : undefined}
          className="pane-in pt-6 space-y-3"
        >
          {active?.content}
        </div>
      </div>
    </div>
  );
}
