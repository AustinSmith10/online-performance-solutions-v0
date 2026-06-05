import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  consultant: "Consultant",
  client: "Client",
};

export default async function UsersPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, org_id, availability, is_locked, invited_at, created_at, organisations(name)")
    .order("created_at", { ascending: false });

  type UserRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "role" | "org_id" | "availability" | "is_locked" | "invited_at" | "created_at"> & {
    organisations: { name: string } | null;
  };

  const users = (data ?? []) as unknown as UserRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Users</h1>
        <Link
          href="/admin/users/invite"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + Invite user
        </Link>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-zinc-500">No users yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">User</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Organisation</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {u.first_name && u.last_name
                        ? `${u.first_name} ${u.last_name}`
                        : u.email}
                    </Link>
                    {(u.first_name || u.last_name) && (
                      <div className="text-xs text-zinc-400">{u.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {u.organisations?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Locked
                      </span>
                    ) : u.role === "consultant" ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.availability === "available"
                          ? "bg-green-100 text-green-700"
                          : u.availability === "on_leave"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}>
                        {u.availability === "available"
                          ? "Available"
                          : u.availability === "on_leave"
                          ? "On leave"
                          : "At capacity"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
