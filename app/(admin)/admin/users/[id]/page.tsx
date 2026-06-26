import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { unlockUser, setConsultantAvailability, resetUserTotp, requireUserTotp } from "@/app/actions/admin-users";
import { EditUserForm } from "./_components/edit-user-form";
import { DangerZone } from "./_components/danger-zone";
import type { User, Organisation, ConsultantAvailability } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [userResult, orgsResult] = await Promise.all([
    supabase.from("users").select("*, organisations(id, name)").eq("id", id).maybeSingle(),
    supabase.from("organisations").select("id, name").order("name"),
  ]);

  if (!userResult.data) notFound();

  const u = userResult.data as User & { organisations: Pick<Organisation, "id" | "name"> | null };
  const organisations = (orgsResult.data ?? []) as Pick<Organisation, "id" | "name">[];

  const unlockAction = unlockUser.bind(null, id);
  const resetTotpAction = resetUserTotp.bind(null, id);
  const requireTotpAction = requireUserTotp.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link href="/admin/users" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Users
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">
            {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
          </h1>
          {u.is_locked && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Locked
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500">{u.email}</p>
      </div>

      {/* Profile summary */}
      <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        <Row label="Role" value={u.role} />
        <Row
          label="Organisation"
          value={
            u.organisations ? (
              <Link
                href={`/admin/organisations/${u.organisations.id}`}
                className="text-zinc-900 hover:underline"
              >
                {u.organisations.name}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <Row label="Phone" value={u.phone ?? "—"} />
        <Row label="Company role" value={u.company_role ?? "—"} />
        <Row label="State / territory" value={u.state_territory ?? "—"} />
        <Row label="Profile complete" value={u.profile_complete ? "Yes" : "No"} />
        <Row label="2FA enabled" value={u.totp_enabled ? "Yes" : "No"} />
        <Row label="Failed login attempts" value={String(u.failed_login_count)} />
        <Row
          label="Invited"
          value={u.invited_at ? new Date(u.invited_at).toLocaleDateString("en-AU") : "—"}
        />
      </div>

      {/* 2FA */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Two-factor authentication</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {u.totp_enabled
                ? "2FA is active. Disable to let the user re-enroll on next login."
                : "Not configured. Enabling will require the user to set up 2FA on next login."}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              u.totp_enabled
                ? "bg-green-100 text-green-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {u.totp_enabled ? "Enabled" : "Not configured"}
          </span>
        </div>
        <div className="mt-4">
          {u.totp_enabled ? (
            <form action={resetTotpAction}>
              <button
                type="submit"
                className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Disable 2FA
              </button>
            </form>
          ) : (
            <form action={requireTotpAction}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Require 2FA setup
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Unlock */}
      {u.is_locked && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-800">Account locked</h2>
          <p className="mt-1 text-sm text-red-700">
            This account was locked after {u.failed_login_count} failed login attempts.
          </p>
          <form action={unlockAction} className="mt-4">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Unlock account
            </button>
          </form>
        </div>
      )}

      {/* Consultant availability */}
      {u.role === "consultant" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Availability</h2>
          <div className="flex gap-2 flex-wrap">
            {(["available", "on_leave", "at_capacity"] as ConsultantAvailability[]).map((status) => {
              const setAction = setConsultantAvailability.bind(null, id, status);
              const isActive = u.availability === status;
              return (
                <form key={status} action={setAction}>
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
        </div>
      )}

      {/* Edit profile */}
      {(u.role === "consultant" || u.role === "client" || u.role === "admin") && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="mb-5 text-sm font-semibold text-zinc-900">Edit profile</h2>
          <EditUserForm user={u} organisations={organisations} />
        </div>
      )}

      {/* Danger zone — not shown for super_admin or admin accounts */}
      {u.role !== "super_admin" && u.role !== "admin" && (
        <DangerZone user={{ id: u.id, email: u.email!, role: u.role }} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-44 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}
