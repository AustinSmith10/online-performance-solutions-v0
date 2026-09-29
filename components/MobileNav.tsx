"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SidebarNavLinks } from "@/components/NavLinks";

interface NavItem {
  href: string;
  label: string;
  group?: string;
  count?: number;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";

export function MobileNav({
  title,
  logo,
  navItems,
  userName,
  profileHref,
  logoutAction,
  notifications,
}: {
  title: string;
  logo?: React.ReactNode;
  navItems: NavItem[];
  userName: string;
  profileHref?: string;
  logoutAction: () => Promise<void>;
  notifications?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Widening past the lg breakpoint hides the drawer's trigger; close it so
  // the scroll lock below can't outlive it.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Escape closes; page scroll locks while open; focus moves into the drawer
  // on open and returns to the hamburger on close.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeButtonRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = prevOverflow;
      };
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      openButtonRef.current?.focus();
    }
  }, [open]);

  return (
    <>
      {/* Mobile top bar — hidden on desktop */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
        {logo ?? <span className="text-sm font-semibold text-zinc-900">{title}</span>}
        <div className="flex items-center gap-1">
          {notifications}
          <button
            ref={openButtonRef}
            onClick={() => setOpen(true)}
            className={`press ml-1 flex h-11 w-11 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 ${FOCUS_RING}`}
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ease-[var(--ease-out)] lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col overscroll-contain bg-white pl-[env(safe-area-inset-left)] shadow-xl transition-[transform,opacity] ease-[var(--ease-out)] motion-reduce:translate-x-0 motion-reduce:duration-150 lg:hidden ${
          open
            ? "translate-x-0 duration-[240ms]"
            : "-translate-x-full duration-[180ms] motion-reduce:opacity-0"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4 box-content pt-[env(safe-area-inset-top)]">
          {logo ?? <span className="text-sm font-semibold text-zinc-900">{title}</span>}
          <button
            ref={closeButtonRef}
            onClick={() => setOpen(false)}
            className={`press flex h-11 w-11 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 ${FOCUS_RING}`}
            aria-label="Close navigation"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-3">
          <SidebarNavLinks items={navItems} onItemClick={() => setOpen(false)} />
        </nav>
        <div className="border-t border-zinc-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="mb-2 truncate px-3 text-xs text-zinc-600">{userName}</p>
          {profileHref && (
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className={`press-subtle mb-1 flex min-h-11 items-center rounded-md px-3 text-sm text-zinc-700 hover:bg-zinc-100 ${FOCUS_RING}`}
            >
              My profile
            </Link>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className={`press-subtle flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-zinc-700 hover:bg-zinc-100 ${FOCUS_RING}`}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
