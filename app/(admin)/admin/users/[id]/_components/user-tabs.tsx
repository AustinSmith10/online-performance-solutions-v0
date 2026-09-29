"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateUserProfile, type EditUserState, updateConsultantDisciplines, type UpdateDisciplinesState } from "@/app/actions/admin-users";
import { DISCIPLINES } from "@/lib/projects/project-number";
import { EditIconButton } from "@/components/EditIconButton";
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
  useRequestNavigate,
} from "@/components/UnsavedChangesProvider";
import type { Client, ConsultantAvailability, UserRole } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

type Tab = "profile" | "availability" | "disciplines";

// Minimal DTO — only the fields this component actually renders/edits.
// Do not widen this to the full `User` row; see issue #157.
export interface UserTabsUser {
  id: string;
  role: UserRole;
  client_id: string | null;
  availability: ConsultantAvailability;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_role: string | null;
  state_territory: string | null;
  disciplines: string[] | null;
}

type Props = {
  user: UserTabsUser;
  clients: Pick<Client, "id" | "name">[];
  availabilityActions: Record<ConsultantAvailability, () => Promise<void>>;
};

export function UserTabs({ user, clients, availabilityActions }: Props) {
  return (
    <UnsavedChangesProvider>
      <UserTabsInner user={user} clients={clients} availabilityActions={availabilityActions} />
    </UnsavedChangesProvider>
  );
}

function UserTabsInner({ user, clients, availabilityActions }: Props) {
  const [tab, setTab] = useState<Tab>("profile");
  const requestNavigate = useRequestNavigate();

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
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { id: "profile" as Tab, label: "Profile" },
          { id: "availability" as Tab, label: "Availability" },
          { id: "disciplines" as Tab, label: "Disciplines" },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => requestNavigate(() => setTab(t.id))}
            className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div key={tab} className="pane-in">
      {tab === "profile" && profileContent}

      {tab === "availability" && (
        <div className="flex gap-2 flex-wrap">
          {(["available", "on_leave", "at_capacity"] as ConsultantAvailability[]).map((status) => {
            const isActive = user.availability === status;
            return (
              <form key={status} action={availabilityActions[status]}>
                <AvailabilityButton isActive={isActive} label={AVAILABILITY_LABELS[status]} />
              </form>
            );
          })}
        </div>
      )}

      {tab === "disciplines" && <DisciplinesSection userId={user.id} disciplines={user.disciplines} />}
      </div>
    </div>
  );
}

function AvailabilityButton({ isActive, label }: { isActive: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-pressed={isActive}
      disabled={pending}
      className={`press-subtle rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${
        isActive
          ? "border-2 border-zinc-900 bg-zinc-900 text-white"
          : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {label}
    </button>
  );
}

function DisciplinesSection({ userId, disciplines }: { userId: string; disciplines: string[] | null }) {
  const [state, action, pending] = useActionState<UpdateDisciplinesState, FormData>(
    updateConsultantDisciplines.bind(null, userId),
    {}
  );
  const current = new Set(disciplines ?? []);

  return (
    <form action={action} className="max-w-sm space-y-4">
      <p className="text-sm text-zinc-500">
        Which report types this consultant can self-assign or be assigned — &quot;Available jobs&quot; and the admin
        assign picker both filter on this.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {DISCIPLINES.map((d) => (
          <label
            key={d.suffix}
            className="flex items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 has-[:checked]:border-zinc-400 has-[:checked]:bg-zinc-50"
          >
            <input
              type="checkbox"
              name="disciplines"
              value={d.suffix}
              defaultChecked={current.has(d.suffix)}
              className="h-3.5 w-3.5 rounded-sm border-zinc-300"
            />
            {d.name}
          </label>
        ))}
      </div>
      {state.error && <p className="rise-in text-xs text-red-600">{state.error}</p>}
      {state.success && !pending && <p className="rise-in text-xs text-green-700">Saved</p>}
      <button
        type="submit"
        disabled={pending}
        className="press-subtle rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
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

function displayValue(user: UserTabsUser, field: FieldDef): string {
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
  user: UserTabsUser;
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
      <p className="mb-4 text-sm text-zinc-500">Details</p>
      <div className="divide-y divide-zinc-100">
        {fields.map((field) => (
          <EditableRow key={field.key} user={user} field={field} />
        ))}
      </div>
    </div>
  );
}

function EditableRow({ user, field }: { user: UserTabsUser; field: FieldDef }) {
  const boundAction = updateUserProfile.bind(null, user.id);
  const [state, formAction, pending] = useActionState<EditUserState, FormData>(boundAction, {});
  const [editing, setEditing] = useState(false);
  useUnsavedChanges(`user-profile-${field.key}`, editing);

  useEffect(() => {
    if (state.saved) queueMicrotask(() => setEditing(false));
  }, [state.saved]);

  const errors = state.errors?.[field.key];

  if (!editing) {
    return (
      <div className="group flex items-baseline gap-4 py-2.5">
        <span className="w-28 shrink-0 text-xs text-zinc-500 sm:w-40">{field.label}</span>
        <span className="min-w-0 flex-1 text-sm text-zinc-900">{displayValue(user, field)}</span>
        <EditIconButton
          onClick={() => setEditing(true)}
          label={`Edit ${field.label}`}
          className="text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="pane-in flex items-center gap-3 py-2.5">
      <label className="w-28 shrink-0 text-xs text-zinc-500 sm:w-40">{field.label}</label>
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
          <p key={e} className="rise-in mt-1 text-xs text-red-600">{e}</p>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
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
