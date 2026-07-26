"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import {
  updateOrgConfig,
  setOrgConfigTokenLink,
  removeOrgConfigTokenLink,
  type ClientConfigState,
  type TokenLinkState,
} from "@/app/actions/clients";
import { EditIconButton } from "@/components/EditIconButton";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

interface RosterEntry {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

interface TokenLink {
  stakeholderId: string;
  field: "name" | "email" | "company";
}

interface Props {
  orgId: string;
  tokens: string[];
  currentConfig: Record<string, string>;
  roster: RosterEntry[];
  tokenLinks: Record<string, TokenLink>;
}

function labelFromToken(token: string): string {
  return token
    .replace(/^ORG_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OrgConfigReadonly({ orgId, tokens, currentConfig, roster, tokenLinks }: Props) {
  if (tokens.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Org config</h2>
        <p className="text-sm text-zinc-500">
          No <code className="rounded bg-zinc-100 px-1 text-xs">ORG_</code> tokens found in this
          org&apos;s templates yet. Upload a template first.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Org config</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Values for <code className="rounded bg-zinc-100 px-1">ORG_</code> tokens used in this org&apos;s templates.
        </p>
      </div>
      <dl className="divide-y divide-zinc-100">
        {tokens.map((token) => (
          <EditableRow
            key={token}
            orgId={orgId}
            token={token}
            value={currentConfig[token] ?? ""}
            roster={roster}
            link={tokenLinks[token]}
          />
        ))}
      </dl>
    </div>
  );
}

function EditableRow({
  orgId,
  token,
  value,
  roster,
  link,
}: {
  orgId: string;
  token: string;
  value: string;
  roster: RosterEntry[];
  link?: TokenLink;
}) {
  const boundAction = updateOrgConfig.bind(null, orgId);
  const [state, formAction, pending] = useActionState<ClientConfigState, FormData>(boundAction, {});
  const boundLinkAction = setOrgConfigTokenLink.bind(null, orgId, token);
  const [linkState, linkFormAction, linkPending] = useActionState<TokenLinkState, FormData>(
    boundLinkAction,
    {}
  );
  const boundUnlink = removeOrgConfigTokenLink.bind(null, orgId, token);

  const [mode, setMode] = useState<"view" | "editText" | "editLink">("view");
  useUnsavedChanges(`org-config-${token}`, mode !== "view");

  useEffect(() => {
    if (state.saved) queueMicrotask(() => setMode("view"));
  }, [state.saved]);
  useEffect(() => {
    if (linkState.saved) queueMicrotask(() => setMode("view"));
  }, [linkState.saved]);

  const linkedEntry = link ? roster.find((r) => r.id === link.stakeholderId) : undefined;
  const displayValue = linkedEntry ? linkedEntry[link!.field] : value;

  if (mode === "view") {
    return (
      <div className="group flex items-baseline justify-between gap-4 py-2.5">
        <dt className="text-sm text-zinc-500">{labelFromToken(token)}</dt>
        <div className="flex items-center gap-2">
          <dd className="text-right text-sm font-medium text-zinc-900">
            {displayValue || <span className="text-zinc-400">—</span>}
            {linkedEntry && (
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                linked
              </span>
            )}
          </dd>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            {linkedEntry ? (
              <form action={boundUnlink}>
                <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-700">
                  Unlink
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setMode("editLink")}
                className="text-xs text-zinc-400 hover:text-zinc-700"
              >
                Link to roster
              </button>
            )}
            <EditIconButton
              onClick={() => setMode("editText")}
              label={`Edit ${labelFromToken(token)}`}
              className="text-zinc-300 hover:text-zinc-600"
            />
          </div>
        </div>
      </div>
    );
  }

  if (mode === "editLink") {
    return (
      <form action={linkFormAction} className="flex flex-wrap items-center gap-2 py-2.5">
        <label className="w-44 shrink-0 text-sm text-zinc-500">
          {labelFromToken(token)}
          <span className="ml-1 block font-mono text-xs font-normal text-zinc-400">{`{${token}}`}</span>
        </label>
        <select
          name="stakeholderId"
          required
          disabled={linkPending}
          defaultValue=""
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2.5 py-1 text-sm focus:border-zinc-500 focus:outline-none"
        >
          <option value="" disabled>
            Select a reviewer…
          </option>
          {roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          name="field"
          required
          disabled={linkPending}
          defaultValue="name"
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm focus:border-zinc-500 focus:outline-none"
        >
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="company">Company</option>
        </select>
        <div className="flex items-center gap-1.5">
          <button type="submit" disabled={linkPending} aria-label="Save" className="text-green-600 hover:text-green-700 disabled:opacity-50">
            <CheckIcon />
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={linkPending}
            aria-label="Cancel"
            className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
          >
            <XIcon />
          </button>
        </div>
        {linkState.error && <p className="w-full text-xs text-red-600">{linkState.error}</p>}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3 py-2.5">
      <label className="w-44 shrink-0 text-sm text-zinc-500">
        {labelFromToken(token)}
        <span className="ml-1 block font-mono text-xs font-normal text-zinc-400">{`{${token}}`}</span>
      </label>
      <div className="min-w-0 flex-1">
        <input
          name={token}
          type="text"
          defaultValue={value}
          disabled={pending}
          autoFocus
          className="min-w-0 w-full rounded-md border border-zinc-300 px-2.5 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60"
        />
        {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="submit"
          disabled={pending}
          aria-label="Save"
          className="text-green-600 hover:text-green-700 disabled:opacity-50"
        >
          <CheckIcon />
        </button>
        <button
          type="button"
          onClick={() => setMode("view")}
          disabled={pending}
          aria-label="Cancel"
          className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
        >
          <XIcon />
        </button>
      </div>
    </form>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
