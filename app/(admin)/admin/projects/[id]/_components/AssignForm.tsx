"use client";

import { useActionState } from "react";
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
}

export function AssignForm({ projectId, consultants, currentConsultantId, isReassign }: Props) {
  const boundAction = assignConsultantFromForm.bind(null, projectId);
  const [state, action, pending] = useActionState<AssignState, FormData>(boundAction, {});

  return (
    <div className="space-y-3">
      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Consultant {isReassign ? "reassigned" : "assigned"} successfully.
        </p>
      )}

      <form action={action} className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="consultant_id" className="mb-1 block text-xs font-medium text-zinc-600">
            {isReassign ? "Reassign to" : "Assign to"}
          </label>
          <select
            id="consultant_id"
            name="consultant_id"
            defaultValue={currentConsultantId}
            required
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
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : isReassign ? "Reassign" : "Assign"}
        </button>
      </form>
    </div>
  );
}
