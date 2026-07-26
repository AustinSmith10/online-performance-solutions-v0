"use client";

import { useActionState } from "react";
import {
  removeProjectStakeholder,
  addProjectStakeholder,
  type StakeholderActionState,
} from "@/app/actions/stakeholders";
import { addProjectStakeholderFromRoster } from "@/app/actions/roster-management";

interface StakeholderRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

interface Props {
  projectId: string;
  templateRequired: StakeholderRow[];
  extras: StakeholderRow[];
  orgRoster: StakeholderRow[];
  locked: boolean;
}

export function ProjectStakeholderSection({
  projectId,
  templateRequired,
  extras,
  orgRoster,
  locked,
}: Props) {
  const addedEmails = new Set(
    [...templateRequired, ...extras].map((s) => s.email.toLowerCase())
  );
  const availableRoster = orgRoster.filter((s) => !addedEmails.has(s.email.toLowerCase()));

  return (
    <div className="space-y-5 p-5">
      {templateRequired.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">
            Required by template — locked, can only be changed on the template itself
          </p>
          <ul className="divide-y divide-zinc-50 rounded-md border border-zinc-100">
            {templateRequired.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-900">{s.name}</p>
                  <p className="text-xs text-zinc-500">{s.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                  Required
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500">One-off reviewers for this project</p>
        {extras.length === 0 ? (
          <p className="text-sm text-zinc-400">None added.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <tbody className="divide-y divide-zinc-50">
                {extras.map((s) => {
                  const removeAction = removeProjectStakeholder.bind(null, projectId, s.id);
                  return (
                    <tr key={s.id}>
                      <td className="py-2 text-zinc-900">{s.name}</td>
                      <td className="py-2 text-zinc-500">{s.email}</td>
                      <td className="py-2 text-right">
                        {!locked && (
                          <form action={removeAction}>
                            <button type="submit" className="text-xs text-red-600 hover:underline">
                              Remove
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!locked && (
        <div className="space-y-4 border-t border-zinc-100 pt-4">
          {availableRoster.length > 0 && (
            <AddFromRosterForm projectId={projectId} roster={availableRoster} />
          )}
          <AddOneOffForm projectId={projectId} />
        </div>
      )}
    </div>
  );
}

function AddFromRosterForm({
  projectId,
  roster,
}: {
  projectId: string;
  roster: StakeholderRow[];
}) {
  const boundAdd = addProjectStakeholderFromRoster.bind(null, projectId);
  const [state, formAction, pending] = useActionState<StakeholderActionState, FormData>(boundAdd, {});

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm font-medium text-zinc-700">Add from client roster</p>
      <div className="flex flex-wrap gap-2">
        <select
          name="stakeholderId"
          required
          disabled={pending}
          defaultValue=""
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        >
          <option value="" disabled>
            Select a reviewer…
          </option>
          {roster.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.email})
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

function AddOneOffForm({ projectId }: { projectId: string }) {
  const boundAdd = addProjectStakeholder.bind(null, projectId);
  const [state, formAction, pending] = useActionState<StakeholderActionState, FormData>(boundAdd, {});

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm font-medium text-zinc-700">Or add a one-off reviewer</p>
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
      {state.saved && <p className="text-sm text-green-600">Reviewer added.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add one-off reviewer"}
      </button>
    </form>
  );
}
