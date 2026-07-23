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

const DOT_COLOR: Record<TrayEntry["kind"], string> = {
  notification: "#3b82f6",
  hard_error: "#dc2626",
  needs_attention: "#d97706",
};

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
  const [useFixed, setUseFixed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  const badgeCount = entries.filter((e) => e.kind !== "notification" || !e.isRead).length;

  const refresh = useCallback(async () => {
    const requests: Promise<Response>[] = [fetch("/api/notifications")];
    if (includeNeedsAttention) requests.push(fetch("/api/system-errors"));
    const responses = await Promise.all(requests);

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
      setUseFixed(typeof window !== "undefined" && window.innerWidth < 640);
      void refresh();
      setOpenAtPathname(pathname);
    } else {
      setOpenAtPathname(null);
    }
  }

  const hasReadNotification = entries.some((e) => e.kind === "notification" && e.isRead);
  const hasUnreadNotification = entries.some((e) => e.kind === "notification" && !e.isRead);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={handleToggle} aria-label="Notifications" style={bellButton}>
        <BellIcon />
        {badgeCount > 0 && (
          <span style={badge}>{badgeCount > 99 ? "99+" : badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={useFixed
          ? { ...tray, position: "fixed", top: "64px", right: "8px", left: "auto" }
          : { ...tray, ...(align === "right" ? { right: 0, left: "auto" } : { left: 0 }) }
        }>
          <div style={trayHeader}>
            <span style={trayTitle}>Notifications</span>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {hasUnreadNotification && (
                <button onClick={() => void markAllRead()} style={markAllBtn}>
                  Mark all read
                </button>
              )}
              {hasReadNotification && (
                <button onClick={handleClear} style={clearBtn}>
                  Clear
                </button>
              )}
              {includeNeedsAttention && (
                <Link href="/admin/system-health" style={markAllBtn}>
                  Details →
                </Link>
              )}
            </div>
          </div>

          <div style={list}>
            {entries.length === 0 ? (
              <p style={empty}>Nothing needs attention</p>
            ) : (
              entries.map((e) => (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  style={{
                    ...item,
                    backgroundColor: e.kind === "notification" && !e.isRead ? "#f0f9ff" : "#fff",
                  }}
                  onClick={() => {
                    if (e.kind === "notification" && !e.isRead) void markOneRead(e.id);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && e.kind === "notification" && !e.isRead) {
                      void markOneRead(e.id);
                    }
                  }}
                >
                  <div
                    style={{
                      ...dot,
                      backgroundColor:
                        e.kind === "notification" && e.isRead ? "transparent" : DOT_COLOR[e.kind],
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={itemText}>{e.message}</p>
                    <div style={itemMeta}>
                      <span style={itemTime}>{timeAgo(e.timestamp)}</span>
                      {e.href && (
                        <Link href={e.href} style={viewLink}>
                          View →
                        </Link>
                      )}
                    </div>
                    {e.resolvable && (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void resolveEntry(e.id);
                        }}
                        style={resolveBtn}
                      >
                        ✓ Mark resolved
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const bellButton: React.CSSProperties = {
  position: "relative",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "6px",
  borderRadius: "6px",
  display: "flex",
  alignItems: "center",
  color: "#ca8a04",
};

const badge: React.CSSProperties = {
  position: "absolute",
  top: "2px",
  right: "2px",
  backgroundColor: "#ef4444",
  color: "#fff",
  borderRadius: "9999px",
  fontSize: "10px",
  fontWeight: "600",
  minWidth: "16px",
  height: "16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 3px",
  lineHeight: 1,
};

const tray: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: "calc(100% + 8px)",
  width: "360px",
  maxWidth: "calc(100vw - 16px)",
  backgroundColor: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  zIndex: 50,
  overflow: "hidden",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const trayHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid #f4f4f5",
};

const trayTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#18181b",
};

const markAllBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "12px",
  color: "#3b82f6",
  padding: 0,
};

const clearBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "12px",
  color: "#a1a1aa",
  padding: 0,
};

const list: React.CSSProperties = { maxHeight: "400px", overflowY: "auto" };

const empty: React.CSSProperties = {
  textAlign: "center",
  color: "#a1a1aa",
  fontSize: "13px",
  padding: "32px 16px",
  margin: 0,
};

const item: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  padding: "12px 16px",
  borderBottom: "1px solid #f4f4f5",
  cursor: "default",
};

const dot: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "9999px",
  marginTop: "5px",
  flexShrink: 0,
};

const itemText: React.CSSProperties = {
  fontSize: "13px",
  color: "#3f3f46",
  margin: "0 0 4px",
  lineHeight: "1.5",
};

const itemMeta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const itemTime: React.CSSProperties = { fontSize: "11px", color: "#a1a1aa" };

const viewLink: React.CSSProperties = { fontSize: "11px", color: "#3b82f6" };

const resolveBtn: React.CSSProperties = {
  marginTop: "8px",
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: 600,
  color: "#15803d",
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "6px",
  padding: "4px 10px",
};

function BellIcon() {
  return (
    <svg
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
