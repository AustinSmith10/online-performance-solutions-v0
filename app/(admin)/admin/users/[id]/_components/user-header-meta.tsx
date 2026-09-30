"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import { updateUserEmail, type EditUserEmailState } from "@/app/actions/admin-users";
import { updateUserProfile, type EditUserState } from "@/app/actions/admin-users";
import { EditIconButton } from "@/components/EditIconButton";
import type { Client, UserRole } from "@/types";

// Minimal DTO — only the fields this component actually renders/edits.
// Do not widen this to the full `User` row; see issue #157.
export interface UserHeaderMetaUser {
  id: string;
  email: string;
  role: UserRole;
  client_id: string | null;
}

type Props = {
  user: UserHeaderMetaUser;
  clients: Pick<Client, "id" | "name">[];
};

export function UserHeaderMeta({ user, clients }: Props) {
  const showClient = user.role === "stakeholder" || !!user.client_id;

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-500">
      <EmailField user={user} />
      {showClient && (
        <>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <ClientField user={user} clients={clients} />
        </>
      )}
    </div>
  );
}

function EmailField({ user }: { user: UserHeaderMetaUser }) {
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
          className="text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
        />
      </span>
    );
  }

  return (
    <form action={formAction} className="pane-in inline-flex items-center gap-1.5">
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
        className="rounded-md p-1 text-green-600 hover:bg-green-50 hover:text-green-700 disabled:opacity-50 [@media(pointer:coarse)]:p-2 transition-colors duration-150"
      >
        <CheckIcon />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={pending}
        aria-label="Cancel"
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 [@media(pointer:coarse)]:p-2 transition-colors duration-150"
      >
        <XIcon />
      </button>
      {state.errors?.email?.map((e) => (
        <p key={e} className="rise-in text-xs text-red-600">{e}</p>
      ))}
    </form>
  );
}

function ClientField({ user, clients }: { user: UserHeaderMetaUser; clients: Pick<Client, "id" | "name">[] }) {
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
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-900"
          >
            {clientName}
          </Link>
        ) : (
          <span className="font-medium text-zinc-900">{clientName}</span>
        )}
        <EditIconButton
          onClick={() => setEditing(true)}
          label="Edit client"
          className="text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
        />
      </span>
    );
  }

  return (
    <form action={formAction} className="pane-in inline-flex items-center gap-1.5">
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
        className="rounded-md p-1 text-green-600 hover:bg-green-50 hover:text-green-700 disabled:opacity-50 [@media(pointer:coarse)]:p-2 transition-colors duration-150"
      >
        <CheckIcon />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={pending}
        aria-label="Cancel"
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 [@media(pointer:coarse)]:p-2 transition-colors duration-150"
      >
        <XIcon />
      </button>
      {state.errors?.client_id?.map((e) => (
        <p key={e} className="rise-in text-xs text-red-600">{e}</p>
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
