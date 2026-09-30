"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NEEDS_ATTENTION_POLL_MS } from "@/lib/notifications/tray";

// Realtime postgres_changes only fires for rows the subscribing user's RLS
// policies let them SELECT. A plain `admin` role (as opposed to
// `super_admin`) has no direct RLS access to several admin-only tables
// (bounce_events, pgboss.job via get_failed_jobs) — see
// NotificationToasts.tsx for the full explanation. Rather than push that
// same caveat into every page that shows admin-only data, this component
// polls on a fallback interval in addition to reacting to the realtime
// events it *can* see, so every page under a layout that mounts this
// component stays reasonably current without a manual refresh.
export function RealtimeRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A refresh re-runs the whole layout and page on the server, so skip it when
  // nobody would see it (background tab: catch up when it becomes visible) or
  // when it would land mid-edit (focused field: try again shortly).
  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(function run() {
      if (document.hidden) return;
      const el = document.activeElement;
      if (el && el.matches("input, textarea, select, [contenteditable='true']")) {
        timer.current = setTimeout(run, 3000);
        return;
      }
      router.refresh();
    }, 300);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`realtime-refresh-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stakeholder_reviews" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inbound_email_queue" }, scheduleRefresh)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      }, scheduleRefresh)
      .subscribe();

    // Routed through the same debounce as the realtime handlers above rather
    // than calling router.refresh() directly — otherwise this interval can
    // fire while a realtime-triggered refresh is still in flight, and Next.js
    // aborts the earlier RSC fetch (surfaces server-side as a Postgres 57014
    // "canceling statement due to user request").
    const pollInterval = setInterval(scheduleRefresh, NEEDS_ATTENTION_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, scheduleRefresh]);

  return null;
}
