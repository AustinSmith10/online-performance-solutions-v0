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

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 300);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`realtime-refresh-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stakeholder_reviews" }, scheduleRefresh)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      }, scheduleRefresh)
      .subscribe();

    const pollInterval = setInterval(() => router.refresh(), NEEDS_ATTENTION_POLL_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [userId, scheduleRefresh, router]);

  return null;
}
