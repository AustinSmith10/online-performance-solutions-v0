"use client";

import { useRef } from "react";

// An underline tab bar with real tab semantics. Arrow keys / Home / End move
// focus between tabs; Enter or Space activates, so tab changes that go through
// an unsaved-changes guard prompt once per choice, not once per arrow press.
//
// The baseline is an inset shadow on the scroll row rather than a border on a
// wrapper: the active tab's 2px line paints over it, with no negative margin
// for the overflow container to clip.
export function TabBar<T extends string>({
  tabs,
  active,
  onSelect,
  idPrefix,
  label,
  className = "",
}: {
  tabs: { id: T; label: string }[];
  active: T | undefined;
  onSelect: (id: T) => void;
  // Ties each tab to its panel: `${idPrefix}-tab-${id}` and `${idPrefix}-panel`.
  idPrefix: string;
  label: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let to = -1;
    if (e.key === "ArrowRight") to = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") to = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    refs.current[tabs[to].id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`-mx-1 flex gap-1 overflow-x-auto px-1 shadow-[inset_0_-1px_0_var(--color-zinc-200)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          id={`${idPrefix}-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={active === t.id ? 0 : -1}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-11 ${
            active === t.id
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
