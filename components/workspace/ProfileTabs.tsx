"use client";

import { useState } from "react";
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
        <div className="flex gap-1 border-b border-zinc-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => requestNavigate(() => setActiveId(t.id))}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active?.id === t.id
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="pt-6 space-y-3">{active?.content}</div>
      </div>
    </div>
  );
}
