"use client";

import { useState } from "react";
import { UnsavedChangesProvider, useRequestNavigate } from "@/components/UnsavedChangesProvider";

interface Tab {
  label: string;
  content: React.ReactNode;
}

export function TemplateTabs({ tabs }: { tabs: Tab[] }) {
  return (
    <UnsavedChangesProvider>
      <TabsInner tabs={tabs} />
    </UnsavedChangesProvider>
  );
}

function TabsInner({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const requestNavigate = useRequestNavigate();

  return (
    <div>
      <div className="flex border-b border-zinc-200">
        {tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            onClick={() => requestNavigate(() => setActive(i))}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === i
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-6 space-y-6">
        {tabs[active].content}
      </div>
    </div>
  );
}
