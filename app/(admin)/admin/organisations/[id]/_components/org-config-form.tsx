"use client";

import { useActionState } from "react";
import { updateOrgConfig, type OrgConfigState } from "@/app/actions/organisations";

interface Props {
  orgId: string;
  tokens: string[];
  currentConfig: Record<string, string>;
}

function labelFromToken(token: string): string {
  return token
    .replace(/^ORG_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OrgConfigForm({ orgId, tokens, currentConfig }: Props) {
  const action = updateOrgConfig.bind(null, orgId);
  const [state, formAction, pending] = useActionState<OrgConfigState, FormData>(action, {});

  if (tokens.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No <code className="rounded bg-zinc-100 px-1 text-xs">ORG_</code> tokens found in this
        org&apos;s templates yet. Upload a template first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {tokens.map((token) => (
        <div key={token}>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            {labelFromToken(token)}
            <span className="ml-2 font-mono text-xs font-normal text-zinc-400">{`{${token}}`}</span>
          </label>
          <input
            name={token}
            type="text"
            defaultValue={currentConfig[token] ?? ""}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
      ))}

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state.saved && (
        <p className="text-sm text-green-600">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save org config"}
      </button>
    </form>
  );
}
