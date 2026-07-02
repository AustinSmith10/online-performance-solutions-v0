"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import { updateUserEmail, type EditUserEmailState } from "@/app/actions/admin-users";
import { updateUserProfile, type EditUserState } from "@/app/actions/admin-users";
import { EditIconButton } from "@/components/EditIconButton";
import type { User, Client } from "@/types";

type Props = {
  user: User;
  clients: Pick<Client, "id" | "name">[];
};

export function UserHeaderMeta({ user, clients }: Props) {
  const showClient = user.role === "stakeholder" || user.role === "consultant";

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-500">
      <EmailField user={user} />
      {showClient && (
        <>
          <span>·</span>
          <ClientField user={user} clients={clients} />
        </>
      )}
    </div>
  );
}

function EmailField({ user }: { user: User }) {
  const boundAction = updateUserEmail.bind(null, user.id);
  const [state, formAction, pending] = useActionState<EditUserEmailState, FormData>(boundAction, {});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state.saved) queueMicrotask(() => setEditing(false));
  }, [state.saved]);

  if (!editing) {
    return (
      <span className="group inline-flex items-center gap-1">
        Email <span className="font-medium text-zinc-900">{user.email}</span>
        <EditIconButton
          onClick={() => setEditing(true)}
          label="Edit email"
          className="text-zinc-300 opacity-0 hover:text-zinc-600 group-hover:opacity-100"
        />
      </span>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1.5">
      <input
        name="email"
        type="email"
        defaultValue={user.email ?? ""}
        disabled={pending}
        required
        autoFocus
        className={inputClass}
      />
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
        onClick={() => setEditing(false)}
        disabled={pending}
        aria-label="Cancel"
        className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
      >
        <XIcon />
      </button>
      {state.errors?.email?.map((e) => (
        <p key={e} className="text-xs text-red-600">{e}</p>
      ))}
    </form>
  );
}

function ClientField({ user, clients }: { user: User; clients: Pick<Client, "id" | "name">[] }) {
  const boundAction = updateUserProfile.bind(null, user.id);
  const [state, formAction, pending] = useActionState<EditUserState, FormData>(boundAction, {});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state.saved) queueMicrotask(() => setEditing(false));
  }, [state.saved]);

  const clientName = clients.find((c) => c.id === user.client_id)?.name ?? "—";

  if (!editing) {
    return (
      <span className="group inline-flex items-center gap-1">
        Client{" "}
        {user.client_id ? (
          <Link
            href={`/admin/clients/${user.client_id}`}
            className="font-medium text-zinc-900 hover:underline"
          >
            {clientName}
          </Link>
        ) : (
          <span className="font-medium text-zinc-900">{clientName}</span>
        )}
        <EditIconButton
          onClick={() => setEditing(true)}
          label="Edit client"
          className="text-zinc-300 opacity-0 hover:text-zinc-600 group-hover:opacity-100"
        />
      </span>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1.5">
      <select
        name="client_id"
        defaultValue={user.client_id ?? ""}
        disabled={pending}
        autoFocus
        className={inputClass}
      >
        <option value="">None</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
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
        onClick={() => setEditing(false)}
        disabled={pending}
        aria-label="Cancel"
        className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
      >
        <XIcon />
      </button>
      {state.errors?.client_id?.map((e) => (
        <p key={e} className="text-xs text-red-600">{e}</p>
      ))}
    </form>
  );
}

const inputClass =
  "min-w-0 rounded-md border border-zinc-300 px-2 py-0.5 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60";

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
