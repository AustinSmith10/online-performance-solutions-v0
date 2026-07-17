"use client";

import { useState } from "react";
import { AssignForm, type ConsultantOption } from "./AssignForm";
import type { ConsultantAvailability } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

type AssignmentHistoryEntry = {
  consultantId: string;
  consultantName: string;
  assignedAt: string;
  projectStatusAtAssignment: string | null;
};

// Persistent left-rail counterpart to the consultant page's ProjectNumberCard
// — always visible once a consultant is assigned, with reassignment as an
// inline reveal rather than a separate tab/step. Admin-only: the consultant
// workspace has no equivalent since the viewer there IS the assignee.
export function ConsultantCard({
  projectId,
  consultants,
  currentConsultantId,
  assignedName,
  availability,
  assignmentHistory,
}: {
  projectId: string;
  consultants: ConsultantOption[];
  currentConsultantId: string;
  assignedName: string | null;
  availability: ConsultantAvailability | null;
  assignmentHistory?: AssignmentHistoryEntry[];
}) {
  const [reassigning, setReassigning] = useState(false);
  const history = assignmentHistory ?? [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Consultant</p>
        {assignedName && (
          <button
            type="button"
            onClick={() => setReassigning((v) => !v)}
            className="text-xs font-medium text-zinc-600 hover:underline"
          >
            {reassigning ? "Cancel" : "Reassign"}
          </button>
        )}
      </div>

      {assignedName ? (
        <div className="mb-1">
          <p className="font-medium text-zinc-900">{assignedName}</p>
          {availability && <p className="text-xs text-zinc-500">{AVAILABILITY_LABELS[availability]}</p>}
        </div>
      ) : (
        <p className="mb-2 text-zinc-400">Unassigned</p>
      )}

      {(reassigning || !assignedName) && (
        <div className="mt-2">
          <AssignForm
            projectId={projectId}
            consultants={consultants}
            currentConsultantId={currentConsultantId}
            isReassign={!!assignedName}
          />
          {consultants.length === 0 && (
            <p className="mt-2 text-xs text-zinc-400">No consultants available.</p>
          )}
        </div>
      )}

      {history.length > 1 && (
        <div className="mt-3 border-t border-zinc-100 pt-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">History</p>
          <div className="space-y-0.5">
            {history.map((a, i) => (
              <p key={`${a.consultantId}-${i}`} className="text-xs text-zinc-500">
                {a.consultantName} · {new Date(a.assignedAt).toLocaleDateString("en-AU")}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
