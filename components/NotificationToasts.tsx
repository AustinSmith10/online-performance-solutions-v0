"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  notificationToEntry,
  failedJobToEntry,
  bounceEventToEntry,
  stalledProjectToEntry,
  pendingReviewToEntry,
  expiringTokenToEntry,
  NEEDS_ATTENTION_POLL_MS,
  type TrayEntry,
} from "@/lib/notifications/tray";
import type { Notification, FailedJob, BounceEvent } from "@/types";
import type { StalledProjectSignal, StakeholderReviewSignal } from "@/lib/admin/needs-attention";

// Regular per-user notifications arrive over Supabase realtime (the
// `notifications` row is always readable by its own recipient, so RLS never
// blocks the push).
//
// The needs-attention/hard-error signals (issue #46) are admin-only and
// sourced from projects/stakeholder_reviews/bounce_events — tables that a
// plain `admin` role (as opposed to `super_admin`) has no direct client-side
// SELECT access to (see the RLS policies in supabase/migrations). Realtime
// postgres_changes enforces RLS per subscriber, so a client-side subscription
// on those tables would silently never fire for plain admins. Polling the
// already-authenticated /api/system-errors route sidesteps that gap.
const TOAST_LIFETIME_MS = 5_500;

interface Toast {
  entry: TrayEntry;
  createdAt: number;
}

export function NotificationToasts({
  userId,
  projectBasePath,
  includeNeedsAttention = false,
  align = "left",
}: {
  userId: string;
  projectBasePath: string;
  includeNeedsAttention?: boolean;
  align?: "left" | "right";
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();
  const seenIds = useRef<Set<string> | null>(null);

  const pushToast = useCallback((entry: TrayEntry) => {
    setToasts((prev) => [...prev, { entry, createdAt: Date.now() }]);
  }, []);

  // Real notifications: instant push over Supabase realtime.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notification-toasts-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          pushToast(notificationToEntry(payload.new as Notification, projectBasePath));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, projectBasePath, pushToast]);

  // Needs-attention/hard-error signals: short-interval poll, diffed against
  // previously-seen IDs so only genuinely new entries toast.
  useEffect(() => {
    if (!includeNeedsAttention) return;

    let cancelled = false;

    async function poll() {
      const res = await fetch("/api/system-errors");
      if (!res.ok || cancelled) return;
      const data = await res.json();

      const newEntries: TrayEntry[] = [
        ...(data.failedJobs as FailedJob[]).map((j) => failedJobToEntry(j, projectBasePath)),
        ...(data.bounceEvents as BounceEvent[]).map((b) =>
          bounceEventToEntry(b, projectBasePath)
        ),
        ...(data.stalledProjects as StalledProjectSignal[]).map((p) =>
          stalledProjectToEntry(p, projectBasePath)
        ),
        ...(data.pendingReviews as StakeholderReviewSignal[]).map((r) =>
          pendingReviewToEntry(r, projectBasePath)
        ),
        ...(data.expiringTokens as StakeholderReviewSignal[]).map((r) =>
          expiringTokenToEntry(r, projectBasePath)
        ),
      ];

      if (seenIds.current === null) {
        // First poll seeds the baseline — don't toast pre-existing entries.
        seenIds.current = new Set(newEntries.map((e) => e.id));
        return;
      }

      for (const entry of newEntries) {
        if (!seenIds.current.has(entry.id)) {
          seenIds.current.add(entry.id);
          pushToast(entry);
        }
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), NEEDS_ATTENTION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [includeNeedsAttention, projectBasePath, pushToast]);

  // Auto-dismiss.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - TOAST_LIFETIME_MS;
      setToasts((prev) => prev.filter((t) => t.createdAt > cutoff));
    }, 500);
    return () => clearInterval(timer);
  }, [toasts.length]);

  function handleClick(toast: Toast) {
    setToasts((prev) => prev.filter((t) => t !== toast));
    if (toast.entry.href) router.push(toast.entry.href);
  }

  function dismiss(toast: Toast, e: React.MouseEvent) {
    e.stopPropagation();
    setToasts((prev) => prev.filter((t) => t !== toast));
  }

  if (toasts.length === 0) return null;

  return (
    <div style={{ ...stack, ...(align === "right" ? { right: "16px" } : { left: "16px" }) }}>
      {toasts.map((t) => {
        const icon = KIND_ICON[t.entry.kind];
        // Rows without a natural "headline — detail" split (see
        // deriveTitleFromMessage) end up with title === message — showing
        // the same sentence twice reads as a bug, so collapse to one line.
        const hasSubtitle = t.entry.title !== t.entry.message;
        return (
          <div key={t.entry.id} role="button" tabIndex={0} onClick={() => handleClick(t)} style={toast}>
            <div style={{ ...iconCircle, backgroundColor: icon.bg }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill={icon.fg}>
                <path fillRule="evenodd" clipRule="evenodd" d={icon.path} />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={toastTitle}>{t.entry.title}</p>
              {hasSubtitle && <p style={toastText}>{t.entry.message}</p>}
            </div>
            <button
              type="button"
              onClick={(e) => dismiss(t, e)}
              aria-label="Dismiss"
              style={dismissBtn}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Mirrors the tray's dot colors (DOT_COLOR in tray.ts) so the two surfaces
// read as one system: same severity, same hue, just a richer glyph here.
const CHECK_PATH =
  "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z";
const ALERT_PATH =
  "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z";
const ERROR_PATH =
  "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z";

const KIND_ICON: Record<TrayEntry["kind"], { bg: string; fg: string; path: string }> = {
  notification: { bg: "#dbeafe", fg: "#2563eb", path: CHECK_PATH },
  needs_attention: { bg: "#fef3c7", fg: "#d97706", path: ALERT_PATH },
  hard_error: { bg: "#fee2e2", fg: "#dc2626", path: ERROR_PATH },
};

const stack: React.CSSProperties = {
  position: "fixed",
  top: "16px",
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  width: "320px",
  maxWidth: "calc(100vw - 32px)",
};

const toast: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-start",
  padding: "12px 14px",
  backgroundColor: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
  cursor: "pointer",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const iconCircle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  borderRadius: "9999px",
  flexShrink: 0,
};

const toastTitle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#18181b",
  margin: 0,
  lineHeight: "1.4",
};

const toastText: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  margin: "2px 0 0",
  lineHeight: "1.5",
};

const dismissBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px",
  color: "#a1a1aa",
  flexShrink: 0,
};
