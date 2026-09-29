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
        <div className="border-b border-zinc-200">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => requestNavigate(() => setActiveId(t.id))}
              className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active?.id === t.id
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
          </div>
        </div>
        <div key={active?.id} className="pane-in pt-6 space-y-3">{active?.content}</div>
      </div>
    </div>
  );
}
