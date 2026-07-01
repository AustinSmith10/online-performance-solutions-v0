"use client";

import { useActionState, useRef, useState } from "react";
import { updateUserProfile, type EditUserState } from "@/app/actions/admin-users";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import type { User, Client } from "@/types";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

type Props = {
  user: User;
  clients: Pick<Client, "id" | "name">[];
  onCancel: () => void;
};

export function EditUserForm({ user, clients, onCancel }: Props) {
  const boundAction = updateUserProfile.bind(null, user.id);
  const [state, action, pending] = useActionState<EditUserState, FormData>(boundAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  const [dirty, setDirty] = useState(false);
  useUnsavedChanges("edit-user-profile", dirty);

  function handleChange() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const changed =
      (data.get("first_name") ?? "") !== (user.first_name ?? "") ||
      (data.get("last_name") ?? "") !== (user.last_name ?? "") ||
      (data.get("phone") ?? "") !== (user.phone ?? "") ||
      (data.get("company_role") ?? "") !== (user.company_role ?? "") ||
      (data.get("state_territory") ?? "") !== (user.state_territory ?? "") ||
      (data.get("client_id") ?? "") !== (user.client_id ?? "");
    setDirty(changed);
  }

  function handleCancel() {
    setDirty(false);
    onCancel();
  }

  return (
    <form ref={formRef} action={action} className="space-y-5" onChange={handleChange}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" error={state.errors?.first_name}>
          <input
            name="first_name"
            type="text"
            defaultValue={user.first_name ?? ""}
            required
            className={input}
          />
        </Field>
        <Field label="Last name" error={state.errors?.last_name}>
          <input
            name="last_name"
            type="text"
            defaultValue={user.last_name ?? ""}
            required
            className={input}
          />
        </Field>
      </div>

      <Field label="Phone" error={state.errors?.phone}>
        <input
          name="phone"
          type="tel"
          defaultValue={user.phone ?? ""}
          className={input}
        />
      </Field>

      <Field label="Company role / title" error={state.errors?.company_role}>
        <input
          name="company_role"
          type="text"
          defaultValue={user.company_role ?? ""}
          className={input}
        />
      </Field>

      <Field label="State / territory" error={state.errors?.state_territory}>
        <select
          name="state_territory"
          defaultValue={user.state_territory ?? ""}
          required
          className={input}
        >
          <option value="" disabled>Select…</option>
          {AU_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>

      {(user.role === "stakeholder" || user.role === "consultant") && (
        <Field label="Client" error={state.errors?.client_id}>
          <select
            name="client_id"
            defaultValue={user.client_id ?? ""}
            className={input}
          >
            <option value="">None</option>
            {clients.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
      )}

      {state.errors?.form?.map((e) => (
        <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{e}</p>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-md border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>
      {children}
      {error?.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
      ))}
    </div>
  );
}

const input =
  "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
