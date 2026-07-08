"use client";

import { useState } from "react";
import { PendingAssignmentModal } from "./PendingAssignmentModal";

export function PendingAssignmentCard({
  projectId,
  label,
  clientName,
  submittedLabel,
  expectedDeliveryLabel,
}: {
  projectId: string;
  label: string;
  clientName: string;
  submittedLabel: string;
  expectedDeliveryLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(true); }}
        className="cursor-pointer rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 hover:bg-amber-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-900 leading-snug">{label}</p>
            <p className="mt-0.5 truncate text-xs text-amber-700">{clientName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
            Awaiting your response
          </span>
        </div>
      </div>

      {open && (
        <PendingAssignmentModal
          projectId={projectId}
          label={label}
          clientName={clientName}
          submittedLabel={submittedLabel}
          expectedDeliveryLabel={expectedDeliveryLabel}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
