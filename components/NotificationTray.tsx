"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Notification } from "@/lib/notifications/types";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Dismissed-ID persistence (localStorage) ───────────────────────────────────
// Only read notifications can be dismissed. Unread ones always show through.

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

function applyDismissed(notifs: Notification[]): Notification[] {
  const dismissed = getDismissed();
  // Unread notifications always show regardless of dismissed state.
  return notifs.filter((n) => !n.is_read || !dismissed.has(n.id));
}

export function NotificationTray({
  initialNotifications,
  projectBasePath,
}: {
  initialNotifications: Notification[];
  projectBasePath: string;
}) {
  // Lazy initialiser: filter dismissed IDs on first render so server-passed
  // notifications that were already cleared don't flash back on mount.
  const [notifications, setNotifications] = useState<Notification[]>(() =>
    applyDismissed(initialNotifications)
  );
  const [openAtPathname, setOpenAtPathname] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const open = openAtPathname !== null && openAtPathname === pathname;

  // Close when clicking outside the tray
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

  const unread = notifications.filter((n) => !n.is_read).length;

  async function refresh() {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      // Re-apply dismissed filter so cleared notifications don't reappear.
      setNotifications(applyDismissed(data as Notification[]));
    }
  }

  async function markAllRead() {
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (res.ok) setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function markOneRead(id: string) {
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify({ ids: [id] }),
    });
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  }

  function handleClear() {
    // Persist the IDs of all currently-read notifications so refresh() won't
    // bring them back. Unread notifications are left untouched.
    const readIds = notifications.filter((n) => n.is_read).map((n) => n.id);
    saveDismissed(readIds);
    setNotifications((prev) => prev.filter((n) => !n.is_read));
  }

  function handleToggle() {
    if (!open) {
      void refresh();
      setOpenAtPathname(pathname);
    } else {
      setOpenAtPathname(null);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={handleToggle} aria-label="Notifications" style={bellButton}>
        <BellIcon />
        {unread > 0 && (
          <span style={badge}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div style={tray}>
          <div style={trayHeader}>
            <span style={trayTitle}>Notifications</span>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {unread > 0 && (
                <button onClick={() => void markAllRead()} style={markAllBtn}>
                  Mark all read
                </button>
              )}
              {notifications.some((n) => n.is_read) && (
                <button onClick={handleClear} style={clearBtn}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={list}>
            {notifications.length === 0 ? (
              <p style={empty}>No notifications</p>
            ) : (
              notifications.map((n) => {
                const href = n.project_id ? `${projectBasePath}/${n.project_id}` : null;
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    style={{ ...item, backgroundColor: n.is_read ? "#fff" : "#f0f9ff" }}
                    onClick={() => { if (!n.is_read) void markOneRead(n.id); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !n.is_read) void markOneRead(n.id);
                    }}
                  >
                    <div style={{ ...dot, backgroundColor: n.is_read ? "transparent" : "#3b82f6" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={itemText}>{n.message}</p>
                      <div style={itemMeta}>
                        <span style={itemTime}>{timeAgo(n.created_at)}</span>
                        {href && (
                          <Link href={href} style={viewLink}>
                            View →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
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
