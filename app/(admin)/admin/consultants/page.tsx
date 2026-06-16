import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { User, ConsultantAvailability } from "@/types";

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

const AVAILABILITY_CLASSES: Record<ConsultantAvailability, string> = {
  available: "bg-green-100 text-green-700",
  on_leave: "bg-yellow-100 text-yellow-700",
  at_capacity: "bg-zinc-100 text-zinc-600",
};

export default async function ConsultantsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, availability, is_locked, organisations(name)")
    .eq("role", "consultant")
    .order("created_at", { ascending: false });

  type ConsultantRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "availability" | "is_locked"> & {
    organisations: { name: string } | null;
  };

  const consultants = (data ?? []) as unknown as ConsultantRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Consultants</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Availability state is set by each consultant from their workspace. Super Admins can
          also update it from the user detail page.
        </p>
      </div>

      {consultants.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No consultants yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[400px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {consultants.map((c) => (
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
                  <td className="px-5 py-3">
                    {c.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Locked
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_CLASSES[c.availability]}`}
                      >
                        {AVAILABILITY_LABELS[c.availability]}
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
