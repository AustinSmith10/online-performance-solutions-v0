"use client";

import { useActionState } from "react";
import { updateProfile, type UpdateProfileState } from "@/app/actions/profile";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

interface ProfileData {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_role: string | null;
  state_territory: string | null;
}

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [state, action, pending] = useActionState<UpdateProfileState, FormData>(
    updateProfile,
    {}
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">My profile</h1>
        <p className="mt-1 text-sm text-zinc-500">Update your personal details.</p>
      </div>

      {/* Read-only info */}
      <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm text-zinc-500">Email</span>
          <span className="text-sm text-zinc-900">{profile.email}</span>
        </div>
      </div>

      {/* Editable fields */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        {state.saved && (
          <div className="mb-5 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
            Profile updated successfully.
          </div>
        )}
        {state.errors?.form?.map((e) => (
          <p key={e} className="mb-5 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {e}
          </p>
        ))}

        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name" error={state.errors?.first_name?.[0]}>
              <input
                name="first_name"
                type="text"
                autoComplete="given-name"
                defaultValue={profile.first_name ?? ""}
                required
                className={input}
              />
            </Field>
            <Field label="Last name" error={state.errors?.last_name?.[0]}>
              <input
                name="last_name"
                type="text"
                autoComplete="family-name"
                defaultValue={profile.last_name ?? ""}
                required
                className={input}
              />
            </Field>
          </div>

          <Field label="Phone number" error={state.errors?.phone?.[0]}>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={profile.phone ?? ""}
              required
              className={input}
            />
          </Field>

          <Field label="Your role / title" error={state.errors?.company_role?.[0]}>
            <input
              name="company_role"
              type="text"
              placeholder="e.g. Property Manager"
              defaultValue={profile.company_role ?? ""}
              required
              className={input}
            />
          </Field>

          <Field label="State / Territory" error={state.errors?.state_territory?.[0]}>
            <select
              name="state_territory"
              defaultValue={profile.state_territory ?? ""}
              required
              className={input}
            >
              <option value="">Select…</option>
              {AU_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>

          <div className="pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const input =
  "block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
