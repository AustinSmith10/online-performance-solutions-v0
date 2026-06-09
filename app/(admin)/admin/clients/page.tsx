import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@/types";

export default async function ClientsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, is_locked, invited_at, organisations(name)")
    .eq("role", "client")
    .order("created_at", { ascending: false });

  type ClientRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "is_locked" | "invited_at"> & {
    organisations: { name: string } | null;
  };

  const clients = (data ?? []) as unknown as ClientRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Clients</h1>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-zinc-500">No clients yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Organisation</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Invited</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${c.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {c.first_name && c.last_name
                        ? `${c.first_name} ${c.last_name}`
                        : c.email}
                    </Link>
                    {(c.first_name || c.last_name) && (
                      <div className="text-xs text-zinc-400">{c.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {c.organisations?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {c.invited_at
                      ? new Date(c.invited_at).toLocaleDateString("en-AU")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Locked
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
