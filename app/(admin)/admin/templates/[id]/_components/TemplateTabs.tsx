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
      <div className="border-b border-zinc-200">
        <div className="-mx-1 flex overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            onClick={() => requestNavigate(() => setActive(i))}
            className={`shrink-0 whitespace-nowrap focus-visible:[outline-offset:-2px] px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 ${
              active === i
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
        </div>
      </div>
      <div key={active} className="pane-in pt-6 space-y-6">
        {tabs[active].content}
      </div>
    </div>
  );
}
