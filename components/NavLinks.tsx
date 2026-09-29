"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  group?: string;
  /** Optional pending count, rendered as a chip when > 0. */
  count?: number;
}

// Small tabular count chip for pending work (e.g. the email queue).
function CountChip({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-200 px-1.5 text-xs font-medium tabular-nums leading-5 text-zinc-700">
      {count}
    </span>
  );
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
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
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
                aria-current={active ? "page" : undefined}
                className={`press-subtle flex items-center rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 [@media(pointer:coarse)]:min-h-11 ${
                  active
                    ? "bg-zinc-200 font-semibold text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {item.label}
                <CountChip count={item.count} />
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
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "shrink-0 border-b-2 border-zinc-900 py-2 transition-colors duration-150 [@media(pointer:coarse)]:py-3 text-sm font-medium text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                : "shrink-0 border-b-2 border-transparent py-2 transition-colors duration-150 [@media(pointer:coarse)]:py-3 text-sm text-zinc-500 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            }
          >
            {item.label}
            <CountChip count={item.count} />
          </Link>
        );
      })}
    </>
  );
}
