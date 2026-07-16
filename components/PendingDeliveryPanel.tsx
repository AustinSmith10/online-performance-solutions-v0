"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { expediteProjectDelivery } from "@/app/actions/projects";

function formatScheduledFor(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PendingDeliveryPanel({
  projectId,
  scheduledFor,
}: {
  projectId: string;
  scheduledFor: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: boolean; scheduledFor: string | null } | null>(
    null
  );

  function handleExpedite() {
    startTransition(async () => {
      const res = await expediteProjectDelivery(projectId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setResult({ delivered: !!res.delivered, scheduledFor: res.scheduledFor ?? null });
      router.refresh();
    });
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-zinc-900">Delivery pending</h3>
      {result ? (
        <p className="text-xs text-zinc-600">
          {result.delivered
            ? "Delivered immediately."
            : `Brought forward — now scheduled for ${formatScheduledFor(result.scheduledFor as string)}.`}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            All stakeholders have approved. The final report is staged to go out on{" "}
            <span className="font-medium text-zinc-700">{formatScheduledFor(scheduledFor)}</span>.
            Expediting still respects business hours — it won&apos;t deliver outside the
            configured window, just brings it forward to the earliest one.
          </p>
          <button
            type="button"
            onClick={handleExpedite}
            disabled={pending}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending ? "Expediting…" : "Expedite delivery"}
          </button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
