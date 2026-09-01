"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { expediteProjectPbdbDispatch } from "@/app/actions/projects";

function formatScheduledFor(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Durable "this PBDB dispatch is staged, not sent" state (#170). A
 * normal/extended PBDB dispatch stages a `pending_deliveries` row without
 * advancing the project past `in_progress`, so without this panel the card
 * still reads "ready to dispatch" and nothing tells the consultant it's
 * already scheduled. "Send now" fires the dispatch immediately.
 */
export function PbdbDispatchSchedule({
  projectId,
  scheduledFor,
}: {
  projectId: string;
  scheduledFor: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleSendNow() {
    startTransition(async () => {
      const res = await expediteProjectPbdbDispatch(projectId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setSent(true);
      router.refresh();
    });
  }

  if (sent) {
    return <p className="text-sm font-medium text-green-700">PBDB dispatched to stakeholders.</p>;
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="text-sm font-semibold text-amber-900">
        Scheduled for {formatScheduledFor(scheduledFor)}
      </p>
      <p className="mt-0.5 text-xs text-amber-800">
        Not sent yet — the dispatch is staged and will go out automatically at the time above.
      </p>
      <button
        type="button"
        onClick={handleSendNow}
        disabled={pending}
        className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send now"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
