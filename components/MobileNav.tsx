"use client";

import { useState } from "react";
import Link from "next/link";

interface NavItem {
  href: string;
  label: string;
}

export function MobileNav({
  title,
  navItems,
  userEmail,
  logoutAction,
  notifications,
}: {
  title: string;
  navItems: NavItem[];
  userEmail: string;
  logoutAction: () => Promise<void>;
  notifications?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — hidden on desktop */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
        <span className="text-sm font-semibold text-zinc-900">{title}</span>
        <div className="flex items-center gap-1">
          {notifications}
          <button
            onClick={() => setOpen(true)}
            className="ml-1 rounded p-1.5 text-zinc-600 hover:bg-zinc-100"
            aria-label="Open navigation"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <span className="text-sm font-semibold text-zinc-900">{title}</span>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close navigation"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-200 p-3">
          <p className="mb-2 truncate text-xs text-zinc-500">{userEmail}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded px-3 py-1.5 text-left text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
