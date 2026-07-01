"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useActionState } from "react";
import { updateOrgConfig, type ClientConfigState } from "@/app/actions/clients";

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

export function OrgConfigReadonly({ orgId, tokens, currentConfig }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const action = updateOrgConfig.bind(null, orgId);
  const [state, formAction, pending] = useActionState<ClientConfigState, FormData>(action, {});

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (state.saved) setOpen(false);
  }, [state.saved]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

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

  const drawer = (
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-300"
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "24rem",
          height: "100dvh",
          zIndex: 50,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms ease-in-out",
        }}
        className="flex flex-col border-l border-zinc-200 bg-white"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Edit org config</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Values are used verbatim when generating documents.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close panel"
            className="ml-3 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
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
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
              </div>
            ))}
            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}
            <div className="pt-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save config"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Org config</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Values for <code className="rounded bg-zinc-100 px-1">ORG_</code> tokens used in this org&apos;s templates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Edit
          </button>
        </div>
        <dl className="divide-y divide-zinc-100">
          {tokens.map((token) => (
            <div key={token} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-sm text-zinc-500">{labelFromToken(token)}</dt>
              <dd className="text-right text-sm font-medium text-zinc-900">
                {currentConfig[token] || <span className="text-zinc-400">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
