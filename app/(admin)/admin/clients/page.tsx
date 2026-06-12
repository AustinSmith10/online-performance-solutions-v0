import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Clients</h1>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No clients yet.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Invited</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {clients.map((c) => (
                <ClickableRow key={c.id} href={`/admin/users/${c.id}`}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-zinc-900">
                      {c.first_name && c.last_name
                        ? `${c.first_name} ${c.last_name}`
                        : c.email}
                    </span>
                    {(c.first_name || c.last_name) && (
                      <div className="text-xs text-zinc-400">{c.email}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {c.organisations?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
                    {c.invited_at
                      ? new Date(c.invited_at).toLocaleDateString("en-AU")
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
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
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
