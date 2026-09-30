import Link from "next/link";

export type SettingsTabId = "delivery" | "documents" | "platform" | "tags";

/**
 * Settings section tabs. The URL is the state (`?tab=`), so a tab is
 * linkable, survives a refresh and needs no client JS. Links (not tab-role
 * buttons) because each tab is a navigation; the current one is marked with
 * aria-current. Same underline style as the rest of the admin tab bars.
 */
export function SettingsTabs({ tabs, active }: { tabs: { id: SettingsTabId; label: string }[]; active: SettingsTabId }) {
  return (
    <nav
      aria-label="Settings sections"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 shadow-[inset_0_-1px_0_var(--color-zinc-200)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            id={`settings-tab-${t.id}`}
            href={`/admin/settings?tab=${t.id}`}
            aria-current={on ? "page" : undefined}
            scroll={false}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center ${
              on ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
