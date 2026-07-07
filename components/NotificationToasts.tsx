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

  if (toasts.length === 0) return null;

  return (
    <div style={{ ...stack, ...(align === "right" ? { right: "16px" } : { left: "16px" }) }}>
      {toasts.map((t) => (
        <div key={t.entry.id} role="button" tabIndex={0} onClick={() => handleClick(t)} style={toast}>
          <div style={{ ...dot, backgroundColor: DOT_COLOR[t.entry.kind] }} />
          <p style={toastText}>{t.entry.message}</p>
        </div>
      ))}
    </div>
  );
}

const DOT_COLOR: Record<TrayEntry["kind"], string> = {
  notification: "#3b82f6",
  hard_error: "#dc2626",
  needs_attention: "#d97706",
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

const dot: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "9999px",
  marginTop: "5px",
  flexShrink: 0,
};

const toastText: React.CSSProperties = {
  fontSize: "13px",
  color: "#3f3f46",
  margin: 0,
  lineHeight: "1.5",
};
