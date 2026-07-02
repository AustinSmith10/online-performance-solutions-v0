"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateProfile,
  changePassword,
  type UpdateProfileState,
  type ChangePasswordState,
} from "@/app/actions/profile";
import { EditIconButton } from "@/components/EditIconButton";

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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);

  const [profileState, profileAction, profilePending] = useActionState<UpdateProfileState, FormData>(
    updateProfile,
    {}
  );
  const [passwordState, passwordAction, passwordPending] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    {}
  );

  useEffect(() => {
    if (profileState.saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
      router.refresh();
    }
  }, [profileState.saved, router]);

  function handleEdit() {
    setEditKey((k) => k + 1);
    setEditing(true);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">My profile</h1>
          <p className="mt-1 text-sm text-zinc-500">Your account information.</p>
        </div>
        {!editing && <EditIconButton onClick={handleEdit} label="Edit profile" />}
      </div>

      {editing ? (
        <EditForm
          key={editKey}
          profile={profile}
          action={profileAction}
          pending={profilePending}
          errors={profileState.errors}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ReadOnlyProfile profile={profile} />
      )}

      <PasswordSection
        action={passwordAction}
        pending={passwordPending}
        state={passwordState}
      />
    </div>
  );
}

function ReadOnlyProfile({ profile }: { profile: ProfileData }) {
  return (
    <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
      <InfoRow label="Email" value={profile.email} />
      <InfoRow label="First name" value={profile.first_name ?? "—"} />
      <InfoRow label="Last name" value={profile.last_name ?? "—"} />
      <InfoRow label="Phone" value={profile.phone ?? "—"} />
      <InfoRow label="Role / Title" value={profile.company_role ?? "—"} />
      <InfoRow label="State / Territory" value={profile.state_territory ?? "—"} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-medium text-zinc-900">{value}</span>
    </div>
  );
}

function EditForm({
  profile,
  action,
  pending,
  errors,
  onCancel,
}: {
  profile: ProfileData;
  action: (formData: FormData) => void;
  pending: boolean;
  errors: UpdateProfileState["errors"];
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      {errors?.form?.map((e) => (
        <p key={e} className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      <div className="mb-5 rounded-md bg-zinc-50 px-4 py-3">
        <p className="text-xs font-medium text-zinc-500">Email</p>
        <p className="mt-0.5 text-sm text-zinc-900">{profile.email}</p>
      </div>

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors?.first_name?.[0]}>
            <input
              name="first_name"
              type="text"
              autoComplete="given-name"
              defaultValue={profile.first_name ?? ""}
              required
              className={input}
            />
          </Field>
          <Field label="Last name" error={errors?.last_name?.[0]}>
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

        <Field label="Phone number" error={errors?.phone?.[0]}>
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={profile.phone ?? ""}
            placeholder="e.g. 0412 345 678"
            required
            className={input}
          />
        </Field>

        <Field label="Role / Title" error={errors?.company_role?.[0]}>
          <input
            name="company_role"
            type="text"
            placeholder="e.g. Property Manager"
            defaultValue={profile.company_role ?? ""}
            required
            className={input}
          />
        </Field>

        <Field label="State / Territory" error={errors?.state_territory?.[0]}>
          <select
            name="state_territory"
            defaultValue={profile.state_territory ?? ""}
            required
            className={input}
          >
            <option value="">Select…</option>
            {AU_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordSection({
  action,
  pending,
  state,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: ChangePasswordState;
}) {
  const [expanded, setExpanded] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(false);
      setFormKey((k) => k + 1);
    }
  }, [state.saved]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Password</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Manage your account password.</p>
        </div>
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Change password
          </button>
        )}
      </div>

      {state.saved && !expanded && (
        <p className="mt-3 text-sm font-medium text-green-700">Password updated successfully.</p>
      )}

      {expanded && (
        <form key={formKey} action={action} className="mt-5 space-y-4">
          {state.errors?.form?.map((e) => (
            <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {e}
            </p>
          ))}

          <Field label="Current password" error={state.errors?.current_password?.[0]}>
            <input
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
              className={input}
            />
          </Field>

          <Field label="New password" error={state.errors?.new_password?.[0]}>
            <input
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              className={input}
            />
            <ul className="mt-2 space-y-1 text-xs text-zinc-400">
              <li>• At least 12 characters</li>
              <li>• One uppercase letter (A–Z)</li>
              <li>• One number (0–9)</li>
              <li>• One special character (e.g. !@#$%)</li>
            </ul>
          </Field>

          <Field label="Confirm new password" error={state.errors?.confirm_password?.[0]}>
            <input
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              className={input}
            />
          </Field>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Updating…" : "Update password"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              disabled={pending}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
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
