"use client";

import { useState } from "react";
import { EditUserForm } from "./edit-user-form";
import type { User, Organisation, ConsultantAvailability } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

type Tab = "profile" | "availability";

type Props = {
  user: User;
  organisations: Pick<Organisation, "id" | "name">[];
  saved: boolean;
  savedFields: string[];
  availabilityActions: Record<ConsultantAvailability, () => Promise<void>>;
};

export function UserTabs({ user, organisations, saved, savedFields, availabilityActions }: Props) {
  const [tab, setTab] = useState<Tab>("profile");

  const isConsultant = user.role === "consultant";
  const hasEditableProfile =
    user.role === "consultant" || user.role === "client" || user.role === "admin";

  if (!isConsultant) {
    return hasEditableProfile ? (
      <EditUserForm user={user} organisations={organisations} saved={saved} savedFields={savedFields} />
    ) : (
      <p className="text-sm text-zinc-500">No editable profile fields for this role.</p>
    );
  }

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

      {tab === "profile" && (
        <EditUserForm user={user} organisations={organisations} saved={saved} savedFields={savedFields} />
      )}

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
