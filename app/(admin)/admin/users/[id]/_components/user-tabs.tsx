"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { updateUserProfile, type EditUserState } from "@/app/actions/admin-users";
import { EditIconButton } from "@/components/EditIconButton";
import type { User, Client, ConsultantAvailability } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

type Tab = "profile" | "availability";

type Props = {
  user: User;
  clients: Pick<Client, "id" | "name">[];
  availabilityActions: Record<ConsultantAvailability, () => Promise<void>>;
};

export function UserTabs({ user, clients, availabilityActions }: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  const isConsultant = user.role === "consultant";
  const hasEditableProfile =
    user.role === "consultant" || user.role === "stakeholder" || user.role === "admin";

  const profileContent = hasEditableProfile ? (
    <ProfileSection user={user} clients={clients} />
  ) : (
    <p className="text-sm text-zinc-500">No editable profile fields for this role.</p>
  );

  if (!isConsultant) return profileContent;

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-200 mb-6">
        {([
          { id: "profile" as Tab, label: "Profile" },
          { id: "availability" as Tab, label: "Availability" },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && profileContent}

      {tab === "availability" && (
        <div className="flex gap-2 flex-wrap">
          {(["available", "on_leave", "at_capacity"] as ConsultantAvailability[]).map((status) => {
            const isActive = user.availability === status;
            return (
              <form key={status} action={availabilityActions[status]}>
                <button
                  type="submit"
                  className={
                    isActive
                      ? "rounded-md border-2 border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                      : "rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  }
                >
                  {AVAILABILITY_LABELS[status]}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}

type FieldKey = "first_name" | "last_name" | "phone" | "company_role" | "state_territory" | "client_id";

type FieldDef =
  | { key: FieldKey; label: string; kind: "text"; inputType?: "text" | "tel"; required?: boolean }
  | {
      key: FieldKey;
      label: string;
      kind: "select";
      options: { value: string; label: string }[];
      placeholder?: string;
      required?: boolean;
    };

function displayValue(user: User, field: FieldDef): string {
  if (field.kind === "select") {
    const current = String(user[field.key] ?? "");
    return field.options.find((o) => o.value === current)?.label ?? "—";
  }
  const raw = user[field.key];
  return raw ? String(raw) : "—";
}

function ProfileSection({
  user,
  clients,
}: {
  user: User;
  clients: Pick<Client, "id" | "name">[];
}) {
  const showOrg = user.role === "stakeholder" || user.role === "consultant";

  const fields: FieldDef[] = [
    { key: "first_name", label: "First name", kind: "text", required: true },
    { key: "last_name", label: "Last name", kind: "text", required: true },
    { key: "phone", label: "Phone", kind: "text", inputType: "tel" },
    { key: "company_role", label: "Company role", kind: "text" },
    {
      key: "state_territory",
      label: "State / territory",
      kind: "select",
      required: true,
      placeholder: "Select…",
      options: AU_STATES.map((s) => ({ value: s, label: s })),
    },
    ...(showOrg
      ? ([
          {
            key: "client_id",
            label: "Client",
            kind: "select",
            options: [{ value: "", label: "None" }, ...clients.map((c) => ({ value: c.id, label: c.name }))],
          } satisfies FieldDef,
        ] as FieldDef[])
      : []),
  ];

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-500">Profile information</p>
      <div className="divide-y divide-zinc-100">
        {fields.map((field) => (
          <EditableRow key={field.key} user={user} field={field} />
        ))}
      </div>
    </div>
  );
}

function EditableRow({ user, field }: { user: User; field: FieldDef }) {
  const boundAction = updateUserProfile.bind(null, user.id);
  const [state, formAction, pending] = useActionState<EditUserState, FormData>(boundAction, {});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state.saved) queueMicrotask(() => setEditing(false));
  }, [state.saved]);

  const errors = state.errors?.[field.key];

  if (!editing) {
    return (
      <div className="group flex items-baseline gap-4 py-2.5">
        <span className="w-40 shrink-0 text-xs text-zinc-400">{field.label}</span>
        <span className="min-w-0 flex-1 text-sm text-zinc-900">{displayValue(user, field)}</span>
        <EditIconButton
          onClick={() => setEditing(true)}
          label={`Edit ${field.label}`}
          className="text-zinc-300 opacity-0 hover:text-zinc-600 group-hover:opacity-100"
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3 py-2.5">
      <label className="w-40 shrink-0 text-xs text-zinc-400">{field.label}</label>
      <div className="min-w-0 flex-1">
        {field.kind === "select" ? (
          <select
            name={field.key}
            defaultValue={String(user[field.key] ?? "")}
            disabled={pending}
            required={field.required}
            autoFocus
            className={inputClass}
          >
            {field.placeholder && (
              <option value="" disabled>
                {field.placeholder}
              </option>
            )}
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            name={field.key}
            type={field.inputType ?? "text"}
            defaultValue={String(user[field.key] ?? "")}
            disabled={pending}
            required={field.required}
            autoFocus
            className={inputClass}
          />
        )}
        {errors?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
        ))}
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
          onClick={() => setEditing(false)}
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

const inputClass =
  "min-w-0 w-full rounded-md border border-zinc-300 px-2.5 py-1 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60";

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
