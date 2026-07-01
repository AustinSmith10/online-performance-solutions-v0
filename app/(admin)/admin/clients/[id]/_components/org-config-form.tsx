"use client";

import { useActionState } from "react";
import { updateOrgConfig, type ClientConfigState } from "@/app/actions/clients";

interface Props {
  orgId: string;
  tokens: string[];
  currentConfig: Record<string, string>;
  highlight?: boolean;
}

function labelFromToken(token: string): string {
  return token
    .replace(/^ORG_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OrgConfigForm({ orgId, tokens, currentConfig, highlight }: Props) {
  const action = updateOrgConfig.bind(null, orgId);
  const [state, formAction, pending] = useActionState<ClientConfigState, FormData>(action, {});

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
            className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
              highlight
                ? "border-green-400 ring-2 ring-green-300 focus:border-green-500"
                : "border-zinc-300 focus:border-zinc-500"
            }`}
          />
        </div>
      ))}

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
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
