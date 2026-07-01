"use client";

import { useEffect, useRef, useState } from "react";
import { EditUserForm } from "./edit-user-form";
import type { User, Client, ConsultantAvailability } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

type Tab = "profile" | "availability";

type Props = {
  user: User;
  clients: Pick<Client, "id" | "name">[];
  saved: boolean;
  savedFields: string[];
  availabilityActions: Record<ConsultantAvailability, () => Promise<void>>;
};

export function UserTabs({ user, clients, saved, savedFields, availabilityActions }: Props) {
  const [tab, setTab] = useState<Tab>("profile");
  const [editing, setEditing] = useState(false);

  const isConsultant = user.role === "consultant";
  const hasEditableProfile =
    user.role === "consultant" || user.role === "stakeholder" || user.role === "admin";

  const profileContent = hasEditableProfile ? (
    <ProfileSection
      user={user}
      clients={clients}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => setEditing(false)}
      saved={saved}
      savedFields={savedFields}
    />
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

const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  company_role: "Company role",
  state_territory: "State / territory",
  client_id: "Client",
};

function ProfileSection({
  user,
  clients,
  editing,
  onEdit,
  onCancel,
  saved,
  savedFields,
}: {
  user: User;
  clients: Pick<Client, "id" | "name">[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  saved: boolean;
  savedFields: string[];
}) {
  const readonlyRef = useRef<HTMLDivElement>(null);

  const orgName = clients.find((o) => o.id === user.client_id)?.name ?? null;
  const showOrg = user.role === "stakeholder" || user.role === "consultant";

  const rows: { field: string; value: string }[] = [
    { field: "first_name", value: user.first_name ?? "—" },
    { field: "last_name", value: user.last_name ?? "—" },
    { field: "phone", value: user.phone ?? "—" },
    { field: "company_role", value: user.company_role ?? "—" },
    { field: "state_territory", value: user.state_territory ?? "—" },
    ...(showOrg ? [{ field: "client_id", value: orgName ?? "—" }] : []),
  ];

  // Highlight saved rows and scroll into view
  useEffect(() => {
    if (!saved || editing || !readonlyRef.current || !savedFields.length) return;
    readonlyRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    savedFields.forEach((field) => {
      const el = readonlyRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
      if (!el) return;
      el.classList.add("bg-green-50", "text-green-800");
      setTimeout(() => el.classList.remove("bg-green-50", "text-green-800"), 2000);
    });
  }, [saved, savedFields, editing]);

  if (editing) {
    return (
      <EditUserForm
        user={user}
        clients={clients}
        onCancel={onCancel}
      />
    );
  }

  return (
    <div ref={readonlyRef}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-500">Profile information</p>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Edit
        </button>
      </div>
      <div className="divide-y divide-zinc-100">
        {rows.map(({ field, value }) => (
          <div
            key={field}
            data-field={field}
            className="flex items-baseline gap-4 py-2.5 transition-colors duration-500 rounded px-1"
          >
            <span className="w-40 shrink-0 text-xs text-zinc-400">{FIELD_LABELS[field]}</span>
            <span className="text-sm text-zinc-900">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
