"use client";

import { useActionState, useState } from "react";
import { assignConsultantFromForm, type AssignState } from "@/app/actions/projects";
import type { ConsultantAvailability } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

export interface ConsultantOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  availability: ConsultantAvailability;
}

interface Props {
  projectId: string;
  consultants: ConsultantOption[];
  currentConsultantId: string;
  isReassign: boolean;
  /** @deprecated No-op: action now redirects on success. */
  onSuccess?: () => void;
}

export function AssignForm({ projectId, consultants, currentConsultantId, isReassign }: Props) {
  const boundAction = assignConsultantFromForm.bind(null, projectId);
  const [state, action, pending] = useActionState<AssignState, FormData>(boundAction, {});
  const [pendingConsultantId, setPendingConsultantId] = useState(currentConsultantId);
  const [confirming, setConfirming] = useState(false);

  const selectedConsultant = consultants.find((c) => c.id === pendingConsultantId);
  const selectedName = selectedConsultant
    ? [selectedConsultant.first_name, selectedConsultant.last_name].filter(Boolean).join(" ") || selectedConsultant.email
    : null;

  return (
    <>
      {confirming && selectedName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <p className="text-base font-semibold text-zinc-900">
              {isReassign ? "Reassign consultant?" : "Assign consultant?"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {isReassign ? "Reassign to" : "Assign"}{" "}
              <strong className="text-zinc-800">{selectedName}</strong>?
              {isReassign && " The previous consultant will be removed."}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={action} className="flex-1">
                <input type="hidden" name="consultant_id" value={pendingConsultantId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Confirm"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {state.error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        )}

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="consultant_id" className="mb-1 block text-xs font-medium text-zinc-600">
              {isReassign ? "Reassign to" : "Assign to"}
            </label>
            <select
              id="consultant_id"
              name="consultant_id"
              value={pendingConsultantId}
              onChange={(e) => setPendingConsultantId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              <option value="" disabled>
                Select a consultant…
              </option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}
                  {" — "}
                  {AVAILABILITY_LABELS[c.availability]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!pendingConsultantId || pendingConsultantId === currentConsultantId}
            onClick={() => setConfirming(true)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {isReassign ? "Reassign" : "Assign"}
          </button>
        </div>
      </div>
    </>
  );
}
