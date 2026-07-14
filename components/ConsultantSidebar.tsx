"use client";

import { useState } from "react";
import Link from "next/link";
import { SidebarNavLinks } from "@/components/NavLinks";

export function ConsultantSidebar({
  navItems,
  userName,
  logoutAction,
  notifications,
}: {
  navItems: { href: string; label: string }[];
  userName: string;
  logoutAction: (formData: FormData) => void | Promise<void>;
  notifications: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width] duration-150 lg:flex ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-3">
        {!collapsed && <span className="truncate text-sm font-semibold text-zinc-900">OPS</span>}
        <div className={`flex items-center gap-1 ${collapsed ? "mx-auto flex-col-reverse gap-2" : ""}`}>
          {!collapsed && notifications}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg
              className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                {item.label.slice(0, 1)}
              </Link>
            ))}
          </div>
        ) : (
          <SidebarNavLinks items={navItems} />
        )}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        {!collapsed && <p className="mb-1 truncate text-xs text-zinc-500">{userName}</p>}
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Link
              href="/ops/profile"
              title="My profile"
              className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
              </svg>
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z" clipRule="evenodd" />
                </svg>
              </button>
            </form>
          </div>
        ) : (
          <>
            <Link
              href="/ops/profile"
              className="mb-1 block rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              My profile
            </Link>
            <Link
              href="/ops?tour=1"
              className="mb-1 block rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              How this works
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded px-3 py-1.5 text-left text-sm text-zinc-600 hover:bg-zinc-100"
              >
                Sign out
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  );
}
