"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
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

  return (
    <>
      {items.map((item) => {
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
