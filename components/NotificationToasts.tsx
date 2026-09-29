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
  leaving?: boolean;
}

// Matches .toast-item[data-leaving] in globals.css.
const TOAST_EXIT_MS = 150;

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
  // Hovering or focusing the stack holds toasts open so they can be read.
  const [paused, setPaused] = useState(false);
  const router = useRouter();
  const seenIds = useRef<Set<string> | null>(null);
  const exitTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

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

  // The stack unmounts when empty, so a pointer that was over it never fires
  // mouseleave — clear the hold or the next toast would never auto-dismiss.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets a pointer-hold whose mouseleave can never fire once the stack unmounts
    if (toasts.length === 0) setPaused(false);
  }, [toasts.length]);

  // Marks matching toasts as leaving (fade + slide out), then unmounts them.
  const exitToasts = useCallback((match: (t: Toast) => boolean) => {
    const ids: string[] = [];
    setToasts((prev) =>
      prev.map((t) => {
        if (t.leaving || !match(t)) return t;
        ids.push(t.entry.id);
        return { ...t, leaving: true };
      })
    );
    const timer = setTimeout(() => {
      exitTimers.current.delete(timer);
      setToasts((prev) => prev.filter((t) => !(t.leaving && ids.includes(t.entry.id))));
    }, TOAST_EXIT_MS);
    exitTimers.current.add(timer);
  }, []);

  useEffect(() => {
    const timers = exitTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Auto-dismiss.
  useEffect(() => {
    if (toasts.length === 0 || paused) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - TOAST_LIFETIME_MS;
      exitToasts((t) => t.createdAt <= cutoff);
    }, 500);
    return () => clearInterval(timer);
  }, [toasts.length, paused, exitToasts]);

  function resume() {
    // Restart every toast's lifetime so nothing vanishes the instant the pointer leaves.
    setToasts((prev) => prev.map((t) => ({ ...t, createdAt: Date.now() })));
    setPaused(false);
  }

  function handleClick(toast: Toast) {
    exitToasts((t) => t.entry.id === toast.entry.id);
    if (toast.entry.href) router.push(toast.entry.href);
  }

  function dismiss(toast: Toast, e: React.MouseEvent) {
    e.stopPropagation();
    exitToasts((t) => t.entry.id === toast.entry.id);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={resume}
      onFocus={() => setPaused(true)}
      onBlur={resume}
      className={`fixed top-[calc(env(safe-area-inset-top)+0.5rem)] z-[100] flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-2 sm:top-4 ${
        align === "right" ? "right-2 sm:right-4" : "left-2 sm:left-4"
      }`}
    >
      {toasts.map((t) => {
        const icon = KIND_ICON[t.entry.kind];
        // Rows without a natural "headline — detail" split (see
        // deriveTitleFromMessage) end up with title === message — showing
        // the same sentence twice reads as a bug, so collapse to one line.
        const hasSubtitle = t.entry.title !== t.entry.message;
        return (
          <div
            key={t.entry.id}
            data-leaving={t.leaving ? "true" : undefined}
            className={`toast-item flex items-start rounded-lg border border-zinc-200 bg-white shadow-lg ${
              align === "right" ? "[--toast-x:16px]" : "[--toast-x:-16px]"
            }`}
          >
            <button
              type="button"
              onClick={() => handleClick(t)}
              className={`press-subtle flex min-w-0 flex-1 items-start gap-3 rounded-l-lg py-3 pl-3.5 pr-1 text-left hover:bg-zinc-50 ${FOCUS_RING}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${icon.bg}`}
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className={icon.fg}>
                  <path fillRule="evenodd" clipRule="evenodd" d={icon.path} />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug text-zinc-900">
                  {t.entry.title}
                </span>
                {hasSubtitle && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">
                    {t.entry.message}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => dismiss(t, e)}
              aria-label="Dismiss notification"
              className={`press flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${FOCUS_RING}`}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";

// Mirrors the tray's dot colors (DOT_CLASS in NotificationTray.tsx) so the two surfaces
// read as one system: same severity, same hue, just a richer glyph here.
const CHECK_PATH =
  "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z";
const ALERT_PATH =
  "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z";
const ERROR_PATH =
  "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z";

const KIND_ICON: Record<TrayEntry["kind"], { bg: string; fg: string; path: string }> = {
  notification: { bg: "bg-zinc-100", fg: "text-zinc-900", path: CHECK_PATH },
  needs_attention: { bg: "bg-amber-100", fg: "text-amber-700", path: ALERT_PATH },
  hard_error: { bg: "bg-red-100", fg: "text-red-600", path: ERROR_PATH },
};
