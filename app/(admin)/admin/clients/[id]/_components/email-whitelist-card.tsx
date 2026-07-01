"use client";

import { useActionState, useEffect, useRef } from "react";
import { addEmailDomain, removeEmailDomain, type WhitelistState } from "@/app/actions/clients";

interface Props {
  orgId: string;
  domains: string[];
}

export function EmailWhitelistCard({ orgId, domains }: Props) {
  const addAction = addEmailDomain.bind(null, orgId);
  const [state, action, pending] = useActionState<WhitelistState, FormData>(addAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      {/* Header + add form */}
      <div className="border-b border-zinc-100 px-5 py-4">
        <h2 className="mb-0.5 text-sm font-semibold text-zinc-900">Email whitelist</h2>
        <p className="text-xs text-zinc-500">
          Only emails from these sender domains can submit via the email webhook. Leave empty to allow all.
        </p>
        <form ref={formRef} action={action} className="mt-4 flex gap-2">
          <input
            name="domain"
            type="text"
            placeholder="example.com.au"
            required
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </form>
        {state.error && (
          <p className="mt-2 text-xs text-red-600">{state.error}</p>
        )}
      </div>

      {/* Domain table */}
      {domains.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-zinc-400">
          No domains added — all senders allowed.
        </p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-sm">
          <thead className="border-b border-zinc-100">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Domain</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {domains.map((domain) => {
              const removeAction = removeEmailDomain.bind(null, orgId, domain);
              return (
                <tr key={domain}>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-800">{domain}</td>
                  <td className="px-5 py-3 text-right">
                    <form action={removeAction}>
                      <button
                        type="submit"
                        className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
