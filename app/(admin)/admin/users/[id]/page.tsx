import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  unlockUser,
  setConsultantAvailability,
  resetUserTotp,
  requireUserTotp,
} from "@/app/actions/admin-users";
import { UserTabs } from "./_components/user-tabs";
import { UserHeaderActions } from "./_components/user-header-actions";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { UnsavedChangesProvider } from "@/components/UnsavedChangesProvider";
import type { User, Client, ConsultantAvailability } from "@/types";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = createAdminClient();

  const [userResult, orgsResult] = await Promise.all([
    supabase.from("users").select("*, clients(id, name)").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  if (!userResult.data) notFound();

  const u = userResult.data as User & { clients: Pick<Client, "id" | "name"> | null };
  const clients = (orgsResult.data ?? []) as Pick<Client, "id" | "name">[];

  const unlockAction = unlockUser.bind(null, id);
  const resetTotpAction = resetUserTotp.bind(null, id);
  const requireTotpAction = requireUserTotp.bind(null, id);
  const availabilityActions = {
    available: setConsultantAvailability.bind(null, id, "available"),
    on_leave: setConsultantAvailability.bind(null, id, "on_leave"),
    at_capacity: setConsultantAvailability.bind(null, id, "at_capacity"),
  } as Record<ConsultantAvailability, () => Promise<void>>;

  const cleanUrl = `/admin/users/${id}`;
  const created = sp.created === "1";
  const saved = sp.saved === "1";
  const savedFields = saved && sp.fields ? String(sp.fields).split(",") : [];
  const deleted = sp.deleted === "1";
  const restored = sp.restored === "1";

  const initials =
    u.first_name && u.last_name
      ? `${u.first_name[0]}${u.last_name[0]}`.toUpperCase()
      : (u.email ?? "?").slice(0, 2).toUpperCase();

  const displayName =
    u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email;

  return (
    <UnsavedChangesProvider>
      {created && (
        <AdminSuccessBanner
          cleanUrl={cleanUrl}
          title="Account created"
          body="The account has been created and a welcome email with a password-setup link has been sent."
        />
      )}
      {saved && (
        <AdminSuccessBanner
          cleanUrl={cleanUrl}
          title="Profile updated"
          body="The user's profile has been saved."
        />
      )}
      {deleted && (
        <AdminSuccessBanner
          cleanUrl={cleanUrl}
          title="Account deactivated"
          body="This user can no longer log in. You can restore them at any time."
        />
      )}
      {restored && (
        <AdminSuccessBanner
          cleanUrl={cleanUrl}
          title="Account restored"
          body="This user can now log in again."
        />
      )}

      <div className="mx-auto max-w-3xl space-y-5">
        {/* Back link */}
        <Link href="/admin/users" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Users
        </Link>

        {/* Header strip */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
              {initials}
            </div>

            {/* Identity */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold text-zinc-900">{displayName}</h1>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 capitalize">
                  {u.role.replace("_", " ")}
                </span>
                {u.is_active ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                    Deactivated
                  </span>
                )}
                {u.is_locked && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Locked
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-500">
                <span>{u.email}</span>
                {u.clients && (
                  <Link
                    href={`/admin/clients/${u.clients.id}`}
                    className="hover:text-zinc-700 hover:underline"
                  >
                    {u.clients.name}
                  </Link>
                )}
              </div>
            </div>

            {/* Header action buttons */}
            <UserHeaderActions
              userId={u.id}
              userEmail={u.email!}
              isActive={u.is_active}
              canDeactivate={u.role !== "super_admin" && u.role !== "admin"}
            />
          </div>

          {/* Stat row */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="2FA"
              value={u.totp_enabled ? "Enabled" : "Not configured"}
              variant={u.totp_enabled ? "success" : "neutral"}
            />
            <StatCard
              label="Failed logins"
              value={String(u.failed_login_count)}
              variant={u.failed_login_count > 0 ? "warning" : "neutral"}
            />
            <StatCard
              label="Profile"
              value={u.profile_complete ? "Complete" : "Incomplete"}
              variant={u.profile_complete ? "success" : "neutral"}
            />
            <StatCard
              label="Invited"
              value={u.invited_at ? new Date(u.invited_at).toLocaleDateString("en-AU") : "—"}
              variant="neutral"
            />
          </div>

          {/* Security actions */}
          <div className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
            {/* 2FA */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">Two-factor authentication</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {u.totp_enabled
                    ? "Active — disable to let the user re-enroll on next login."
                    : "Not configured — enabling will require 2FA setup on next login."}
                </p>
              </div>
              {u.totp_enabled ? (
                <form action={resetTotpAction}>
                  <button
                    type="submit"
                    className="ml-4 shrink-0 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Disable 2FA
                  </button>
                </form>
              ) : (
                <form action={requireTotpAction}>
                  <button
                    type="submit"
                    className="ml-4 shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    Require 2FA
                  </button>
                </form>
              )}
            </div>

            {/* Unlock (only when locked) */}
            {u.is_locked && (
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-red-800">Account locked</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Locked after {u.failed_login_count} failed login attempts.
                  </p>
                </div>
                <form action={unlockAction}>
                  <button
                    type="submit"
                    className="ml-4 shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                  >
                    Unlock account
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Tabbed sections */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <UserTabs
            user={u}
            clients={clients}
            saved={saved}
            savedFields={savedFields}
            availabilityActions={availabilityActions}
          />
        </div>
      </div>
    </UnsavedChangesProvider>
  );
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "success" | "warning" | "neutral";
}) {
  const containerClass =
    variant === "warning"
      ? "rounded-r-lg border border-zinc-200 border-l-[3px] border-l-amber-400 bg-white px-3 py-2.5"
      : variant === "success"
      ? "rounded-r-lg border border-zinc-200 border-l-[3px] border-l-green-500 bg-white px-3 py-2.5"
      : "rounded-lg border border-zinc-200 bg-white px-3 py-2.5";
  const valueClass =
    variant === "success"
      ? "text-green-700"
      : variant === "warning"
      ? "text-amber-700"
      : "text-zinc-900";

  return (
    <div className={containerClass}>
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}
