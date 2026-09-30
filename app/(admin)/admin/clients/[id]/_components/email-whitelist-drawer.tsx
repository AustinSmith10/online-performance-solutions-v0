"use client";

import { FormSubmitButton } from "@/components/FormSubmitButton";
import { useState, useEffect, useRef, useActionState } from "react";
import { addEmailDomain, removeEmailDomain, type WhitelistState } from "@/app/actions/clients";
import { Drawer } from "@/components/Drawer";

interface Props {
  orgId: string;
  domains: string[];
}

export function EmailWhitelistDrawer({ orgId, domains }: Props) {
  const [open, setOpen] = useState(false);
  const addAction = addEmailDomain.bind(null, orgId);
  const [state, action, pending] = useActionState<WhitelistState, FormData>(addAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press-subtle rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
      >
        Email whitelist ({domains.length})
      </button>
      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Email whitelist"
        subtitle="Only these sender domains can submit via the email webhook. Leave empty to allow all."
      >
        <div className="space-y-4">
          <form ref={formRef} action={action} className="flex gap-2">
            <input
              name="domain"
              type="text"
              placeholder="example.com.au"
              aria-label="Sender domain"
              required
              className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <button
              type="submit"
              disabled={pending}
              className="press-subtle rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add"}
            </button>
          </form>
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}

          {domains.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
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
                      <FormSubmitButton pendingLabel="Removing…" className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 transition-colors duration-150 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">Remove</FormSubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Drawer>
    </>
  );
}
