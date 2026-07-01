"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useActionState } from "react";
import { addEmailDomain, removeEmailDomain, type WhitelistState } from "@/app/actions/clients";

interface Props {
  orgId: string;
  domains: string[];
}

export function EmailWhitelistDrawer({ orgId, domains }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const addAction = addEmailDomain.bind(null, orgId);
  const [state, action, pending] = useActionState<WhitelistState, FormData>(addAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const modal = (
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 200ms" }}
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ pointerEvents: open ? "auto" : "none" }}
        aria-modal="true"
        role="dialog"
      >
        <div
          className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl"
          style={{
            transform: open ? "scale(1)" : "scale(0.97)",
            opacity: open ? 1 : 0,
            transition: "transform 200ms, opacity 200ms",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Email whitelist</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Only these sender domains can submit via the email webhook. Leave empty to allow all.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-3 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4">
            <form ref={formRef} action={action} className="flex gap-2">
              <input
                name="domain"
                type="text"
                placeholder="example.com.au"
                required
                autoFocus
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add"}
              </button>
            </form>
            {state.error && <p className="text-xs text-red-600">{state.error}</p>}

            {domains.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">
                No domains added — all senders allowed.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {domains.map((domain) => {
                  const removeAction = removeEmailDomain.bind(null, orgId, domain);
                  return (
                    <li key={domain} className="flex items-center justify-between py-2.5">
                      <span className="font-mono text-xs text-zinc-800">{domain}</span>
                      <form action={removeAction}>
                        <button
                          type="submit"
                          className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
      >
        Email whitelist ({domains.length})
      </button>
      {mounted && createPortal(modal, document.body)}
    </>
  );
}
