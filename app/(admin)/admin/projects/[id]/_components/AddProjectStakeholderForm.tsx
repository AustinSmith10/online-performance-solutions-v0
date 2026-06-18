"use client";

import { useActionState } from "react";
import { addProjectStakeholder, type StakeholderActionState } from "@/app/actions/stakeholders";

export function AddProjectStakeholderForm({ projectId }: { projectId: string }) {
  const boundAdd = addProjectStakeholder.bind(null, projectId);
  const [state, formAction, pending] = useActionState<StakeholderActionState, FormData>(
    boundAdd,
    {}
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm font-medium text-zinc-700">Add project stakeholder</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          name="name"
          type="text"
          required
          placeholder="Full name"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="Email address"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <input
          name="company"
          type="text"
          placeholder="Company (optional)"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p className="text-sm text-green-600">Stakeholder added.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add stakeholder"}
      </button>
    </form>
  );
}
