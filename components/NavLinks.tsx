"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  group?: string;
}

// Picks the most specific (longest) href that matches the current pathname,
// so /portal/history doesn't also light up /portal.
function getActiveHref(pathname: string, items: NavItem[]): string | null {
  const matches = items.filter(
    ({ href }) => pathname === href || pathname.startsWith(href + "/")
  );
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.href.length >= b.href.length ? a : b)).href;
}

// Groups items while preserving first-seen order of both groups and items.
// Ungrouped items (no `group`) render at the top with no header.
function groupItems(items: NavItem[]): { group: string | null; items: NavItem[] }[] {
  const order: (string | null)[] = [];
  const byGroup = new Map<string | null, NavItem[]>();
  for (const item of items) {
    const key = item.group ?? null;
    if (!byGroup.has(key)) {
      order.push(key);
      byGroup.set(key, []);
    }
    byGroup.get(key)!.push(item);
  }
  return order.map((group) => ({ group, items: byGroup.get(group)! }));
}

// ─── Sidebar nav (admin + consultant layouts) ─────────────────────────────────

export function SidebarNavLinks({
  items,
  onItemClick,
}: {
  items: NavItem[];
  onItemClick?: () => void;
}) {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname, items);
  const sections = groupItems(items);

  return (
    <>
      {sections.map(({ group, items: groupItems }) => (
        <div key={group ?? "_ungrouped"} className="mb-3 last:mb-0">
          {group && (
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {group}
            </p>
          )}
          {groupItems.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={
                  active
                    ? "block rounded px-3 py-2 text-sm font-medium bg-zinc-100 text-zinc-900"
                    : "block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ─── Top nav (client layout) ──────────────────────────────────────────────────

export function TopNavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname, items);

  return (
    <>
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "shrink-0 rounded px-3 py-1.5 text-sm font-medium bg-zinc-100 text-zinc-900"
                : "shrink-0 rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
