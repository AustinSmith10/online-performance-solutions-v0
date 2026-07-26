"use client";

import { useActionState } from "react";
import type { StakeholderActionState } from "@/app/actions/stakeholders";
import { removeOrgStakeholder } from "@/app/actions/roster-management";
import { AddStakeholderForm } from "./add-stakeholder-form";

interface StakeholderRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

interface Props {
  orgId: string;
  stakeholders: StakeholderRow[];
  referencedByTemplate?: Record<string, string[]>;
  referencedByToken?: Record<string, string[]>;
}

export function StakeholderList({
  orgId,
  stakeholders,
  referencedByTemplate = {},
  referencedByToken = {},
}: Props) {
  return (
    <div className="space-y-6">
      {stakeholders.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No default stakeholders configured. Add at least one below.
        </p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-zinc-100">
            <tr>
              <th className="pb-2 text-left font-medium text-zinc-500">Name</th>
              <th className="pb-2 text-left font-medium text-zinc-500">Email</th>
              <th className="pb-2 text-left font-medium text-zinc-500">Company</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {stakeholders.map((s) => (
              <StakeholderRowItem
                key={s.id}
                orgId={orgId}
                stakeholder={s}
                templates={referencedByTemplate[s.id] ?? []}
                tokens={referencedByToken[s.id] ?? []}
              />
            ))}
          </tbody>
        </table>
        </div>
      )}

      <AddStakeholderForm orgId={orgId} />
    </div>
  );
}

function StakeholderRowItem({
  orgId,
  stakeholder: s,
  templates,
  tokens,
}: {
  orgId: string;
  stakeholder: StakeholderRow;
  templates: string[];
  tokens: string[];
}) {
  const boundRemove = removeOrgStakeholder.bind(null, orgId, s.id);
  const [state, formAction, pending] = useActionState<StakeholderActionState, FormData>(boundRemove, {});

  const references = [
    ...templates.map((t) => `required by template "${t}"`),
    ...tokens.map((t) => `linked to token {${t}}`),
  ];

  return (
    <tr>
      <td className="py-2 font-medium text-zinc-900">
        {s.name}
        {references.length > 0 && (
          <span
            title={references.join(", ")}
            className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
          >
            🔗 linked
          </span>
        )}
      </td>
      <td className="py-2 text-zinc-600">{s.email}</td>
      <td className="py-2 text-zinc-500">{s.company ?? "—"}</td>
      <td className="py-2 text-right align-top">
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        </form>
        {state.error && <p className="mt-1 max-w-[220px] text-right text-xs text-red-600">{state.error}</p>}
      </td>
    </tr>
  );
}
