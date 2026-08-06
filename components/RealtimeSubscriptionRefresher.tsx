"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type RealtimeSubscription = {
  table: string;
  /** Supabase postgres_changes filter, e.g. `id=eq.${projectId}`. Omit to receive every row (subject to RLS). */
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

/**
 * Invisible component that opens one Supabase Realtime channel subscribed to
 * the given `{ table, filter, event }` list and calls router.refresh() on any
 * matching change, so the enclosing server component re-fetches and the page
 * updates without a manual reload.
 */
export function RealtimeSubscriptionRefresher({
  channelName,
  subscriptions,
}: {
  channelName: string;
  subscriptions: RealtimeSubscription[];
}) {
  const router = useRouter();
  const subscriptionsKey = JSON.stringify(subscriptions);

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel(channelName);

    for (const sub of subscriptions) {
      channel = channel.on(
        "postgres_changes",
        { event: sub.event ?? "*", schema: "public", table: sub.table, filter: sub.filter },
        () => router.refresh()
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, subscriptionsKey, router]);

  return null;
}
