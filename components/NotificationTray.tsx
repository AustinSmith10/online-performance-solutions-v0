"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { TrayEntry } from "@/lib/notifications/tray";
import {
  sortEntries,
  notificationToEntry,
  failedJobToEntry,
  bounceEventToEntry,
  creditRaceEventToEntry,
  stalledProjectToEntry,
  pendingReviewToEntry,
  expiringTokenToEntry,
  NEEDS_ATTENTION_POLL_MS,
} from "@/lib/notifications/tray";
import type { Notification, FailedJob, BounceEvent, CreditRaceEvent } from "@/types";
import type { StalledProjectSignal, StakeholderReviewSignal } from "@/lib/admin/needs-attention";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const DOT_CLASS: Record<TrayEntry["kind"], string> = {
  notification: "bg-zinc-900",
  hard_error: "bg-red-600",
  needs_attention: "bg-amber-600",
};

const KIND_LABEL: Record<TrayEntry["kind"], string> = {
  notification: "Unread",
  hard_error: "Error",
  needs_attention: "Needs attention",
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";

// ── Dismissed-ID persistence (localStorage) ───────────────────────────────────
// Only read notifications can be dismissed. Unread notifications, and all
// hard-error/needs-attention entries (which have no read state — they clear
// themselves once the underlying issue resolves server-side), always show through.

const STORAGE_KEY = "ops-dismissed-notif";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: string[]) {
  try {
    const current = getDismissed();
    for (const id of ids) current.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
  } catch {}
}

function applyDismissed(entries: TrayEntry[]): TrayEntry[] {
  const dismissed = getDismissed();
  return entries.filter((e) => e.kind !== "notification" || !e.isRead || !dismissed.has(e.id));
}

export function NotificationTray({
  initialEntries,
  projectBasePath,
  userId,
  includeNeedsAttention = false,
  align = "left",
}: {
  initialEntries: TrayEntry[];
  projectBasePath: string;
  userId: string;
  includeNeedsAttention?: boolean;
  align?: "left" | "right";
}) {
  // Lazy initialiser: filter dismissed IDs on first render so server-passed
  // entries that were already cleared don't flash back on mount.
  const [entries, setEntries] = useState<TrayEntry[]>(() => applyDismissed(initialEntries));
  const [openAtPathname, setOpenAtPathname] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const badgeRef = useRef<HTMLSpanElement>(null);
  const prevBadgeCount = useRef<number | null>(null);
  const pathname = usePathname();
  // NotificationTray is often rendered twice per layout (mobile nav +
  // desktop sidebar). Supabase reuses/collides on a channel of an already-
  // subscribed topic name, so each mounted instance needs its own topic.
  const instanceId = useId();
  const open = openAtPathname !== null && openAtPathname === pathname;

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenAtPathname(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenAtPathname(null);
        bellRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const badgeCount = entries.filter((e) => e.kind !== "notification" || !e.isRead).length;

  const refresh = useCallback(async () => {
    let responses: Response[];
    try {
      const requests: Promise<Response>[] = [fetch("/api/notifications")];
      if (includeNeedsAttention) requests.push(fetch("/api/system-errors"));
      responses = await Promise.all(requests);
    } catch {
      // Background poll — a transient network blip (e.g. the server
      // restarting during a deploy) is not an error to throw. Swallowing it
      // keeps it from becoming an unhandled rejection in Sentry; the tray
      // shows a quiet "Couldn't refresh" line instead and the next interval
      // tick retries.
      setRefreshFailed(true);
      return;
    }

    setRefreshFailed(responses.some((r) => !r.ok));

    const merged: TrayEntry[] = [];
    if (responses[0].ok) {
      const notifs = (await responses[0].json()) as Notification[];
      merged.push(...notifs.map((n) => notificationToEntry(n, projectBasePath)));
    }
    if (includeNeedsAttention && responses[1]?.ok) {
      const signals = await responses[1].json();
      merged.push(
        ...(signals.failedJobs as FailedJob[]).map((j) => failedJobToEntry(j, projectBasePath)),
        ...(signals.bounceEvents as BounceEvent[]).map((b) =>
          bounceEventToEntry(b, projectBasePath)
        ),
        ...(signals.creditRaceEvents as CreditRaceEvent[]).map((c) =>
          creditRaceEventToEntry(c, projectBasePath)
        ),
        ...(signals.stalledProjects as StalledProjectSignal[]).map((p) =>
          stalledProjectToEntry(p, projectBasePath)
        ),
        ...(signals.pendingReviews as StakeholderReviewSignal[]).map((r) =>
          pendingReviewToEntry(r, projectBasePath)
        ),
        ...(signals.expiringTokens as StakeholderReviewSignal[]).map((r) =>
          expiringTokenToEntry(r, projectBasePath)
        )
      );
    }
    setEntries(applyDismissed(sortEntries(merged)));
  }, [includeNeedsAttention, projectBasePath]);

  // Keep the badge/list current without requiring the tray to be opened.
  // Real notifications push instantly over realtime; the admin-only
  // needs-attention/hard-error signals fall back to a short-interval poll
  // (see NotificationToasts.tsx for why those can't ride on realtime).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notification-tray-${userId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, instanceId, refresh]);

  useEffect(() => {
    if (!includeNeedsAttention) return;
    const interval = setInterval(() => void refresh(), NEEDS_ATTENTION_POLL_MS);
    return () => clearInterval(interval);
  }, [includeNeedsAttention, refresh]);

  async function markAllRead() {
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setEntries((prev) =>
        prev.map((e) => (e.kind === "notification" ? { ...e, isRead: true } : e))
      );
    }
  }

  async function markOneRead(id: string) {
    const rawId = id.replace(/^notif-/, "");
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify({ ids: [rawId] }),
    });
    if (res.ok) {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, isRead: true } : e)));
    }
  }

  async function resolveEntry(id: string) {
    const res = await fetch("/api/system-errors/resolve", {
      method: "POST",
      body: JSON.stringify({ signalId: id }),
    });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function handleClear() {
    // Persist the IDs of all currently-read notifications so refresh() won't
    // bring them back. Everything else is left untouched.
    const readIds = entries
      .filter((e) => e.kind === "notification" && e.isRead)
      .map((e) => e.id);
    saveDismissed(readIds);
    setEntries((prev) => prev.filter((e) => e.kind !== "notification" || !e.isRead));
  }

  function handleToggle() {
    if (!open) {
      void refresh();
      setOpenAtPathname(pathname);
    } else {
      setOpenAtPathname(null);
    }
  }

  // One small pulse when the unread count goes up (never on mount, never on
  // decrease, and not at all under reduced motion — the number already changes).
  useEffect(() => {
    const prev = prevBadgeCount.current;
    prevBadgeCount.current = badgeCount;
    if (prev === null || badgeCount <= prev) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    badgeRef.current?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }],
      { duration: 240, easing: "cubic-bezier(0.77, 0, 0.175, 1)" }
    );
  }, [badgeCount]);

  const hasReadNotification = entries.some((e) => e.kind === "notification" && e.isRead);
  const hasUnreadNotification = entries.some((e) => e.kind === "notification" && !e.isRead);

  const hasUnreadError = entries.some((e) => e.kind !== "notification");
  const unreadLabel = badgeCount > 0 ? `Notifications, ${badgeCount} unread` : "Notifications";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={bellRef}
        type="button"
        onClick={handleToggle}
        aria-label={unreadLabel}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`press relative flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${FOCUS_RING}`}
      >
        <BellIcon />
        {badgeCount > 0 && (
          <span
            ref={badgeRef}
            aria-hidden="true"
            className={`absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-xs font-semibold leading-none tabular-nums text-white ring-2 ring-white ${
              hasUnreadError ? "bg-red-600" : "bg-zinc-900"
            }`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className={`tray-pop fixed inset-x-2 top-[calc(env(safe-area-inset-top)+4rem)] z-50 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:w-[360px] ${
            align === "right" ? "sm:right-0" : "origin-top-left sm:left-0"
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">Notifications</h2>
            <div className="flex items-center gap-1">
              {hasUnreadNotification && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className={`press rounded-md px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 [@media(pointer:coarse)]:min-h-11 ${FOCUS_RING}`}
                >
                  Mark all read
                </button>
              )}
              {hasReadNotification && (
                <button
                  type="button"
                  onClick={handleClear}
                  className={`press rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 [@media(pointer:coarse)]:min-h-11 ${FOCUS_RING}`}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {refreshFailed && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"
            >
              <span>Couldn&apos;t refresh. Showing what was last loaded.</span>
              <button
                type="button"
                onClick={() => void refresh()}
                className={`press shrink-0 rounded-md px-2 py-1 font-medium underline-offset-2 hover:underline ${FOCUS_RING}`}
              >
                Retry
              </button>
            </div>
          )}

          <ul className="max-h-[min(24rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain">
            {entries.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <p className="text-sm font-medium text-zinc-700">You&apos;re all caught up</p>
                <p className="text-xs text-zinc-500">New notifications will show up here.</p>
              </li>
            ) : (
              entries.map((e) => {
                const unread = e.kind !== "notification" || !e.isRead;
                const canMarkRead = e.kind === "notification" && !e.isRead;
                return (
                  <li
                    key={e.id}
                    onClick={() => {
                      if (canMarkRead) void markOneRead(e.id);
                    }}
                    className={`flex gap-3 border-b border-zinc-100 px-4 py-3 transition-colors duration-150 ease-[var(--ease-out)] last:border-b-0 ${
                      unread ? "bg-zinc-50" : "bg-white"
                    }`}
                  >
                    <span
                      aria-hidden={!unread}
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-opacity duration-150 ease-[var(--ease-out)] ${
                        DOT_CLASS[e.kind]
                      } ${unread ? "opacity-100" : "opacity-0"}`}
                    >
                      {unread && <span className="sr-only">{KIND_LABEL[e.kind]}</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-zinc-900">{e.title}</p>
                      {e.message !== e.title && (
                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{e.message}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs tabular-nums text-zinc-500">{timeAgo(e.timestamp)}</span>
                        {e.href && (
                          <Link
                            href={e.href}
                            className={`-my-1 rounded py-1 text-xs font-medium text-zinc-900 underline-offset-2 hover:underline ${FOCUS_RING}`}
                          >
                            View
                          </Link>
                        )}
                        {canMarkRead && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void markOneRead(e.id);
                            }}
                            className={`-my-1 rounded py-1 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline ${FOCUS_RING}`}
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      {e.resolvable && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void resolveEntry(e.id);
                          }}
                          className={`press mt-2 inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 [@media(pointer:coarse)]:min-h-11 ${FOCUS_RING}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          Mark resolved
                        </button>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {includeNeedsAttention && (
            <div className="border-t border-zinc-100 px-4 py-2">
              <Link
                href="/admin/system-health"
                className={`-mx-2 inline-flex rounded-md px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 ${FOCUS_RING}`}
              >
                System health
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
