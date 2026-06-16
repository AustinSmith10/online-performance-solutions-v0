import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLogEntry } from "@/types";

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    event_type?: string;
    project_id?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { email, event_type, project_id, from, to } = await searchParams;

  const supabase = createAdminClient();

  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (email?.trim()) {
    query = query.ilike("actor_email", `%${email.trim()}%`);
  }
  if (event_type?.trim()) {
    query = query.eq("event_type", event_type.trim());
  }
  if (project_id?.trim()) {
    query = query.eq("project_id", project_id.trim());
  }
  if (from?.trim()) {
    query = query.gte("created_at", new Date(from.trim()).toISOString());
  }
  if (to?.trim()) {
    const toDate = new Date(to.trim());
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("created_at", toDate.toISOString());
  }

  const { data } = await query;
  const entries = (data ?? []) as AuditLogEntry[];

  const hasFilter = email || event_type || project_id || from || to;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Audit trail</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Immutable system event log. Showing last {PAGE_SIZE} matching entries.
        </p>
      </div>

      {/* Filter form — plain HTML GET */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          type="text"
          name="email"
          defaultValue={email ?? ""}
          placeholder="Actor email"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <input
          type="text"
          name="event_type"
          defaultValue={event_type ?? ""}
          placeholder="Event type (e.g. auth.login)"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <input
          type="text"
          name="project_id"
          defaultValue={project_id ?? ""}
          placeholder="Project ID (UUID)"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Search
        </button>
        {hasFilter && (
          <a
            href="/admin/audit"
            className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            Clear
          </a>
        )}
      </form>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No audit entries found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Timestamp</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Event type</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Actor</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Project</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-500">
                    {new Date(entry.created_at).toLocaleString("en-AU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-800">
                    {entry.event_type}
                  </td>
                  <td className="px-5 py-3 text-xs text-zinc-600">
                    {entry.actor_email ?? (entry.actor_id ? entry.actor_id.slice(0, 8) + "…" : "—")}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-400">
                    {entry.project_id ? entry.project_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="max-w-xs truncate px-5 py-3 font-mono text-xs text-zinc-400">
                    {entry.metadata ? JSON.stringify(entry.metadata) : "—"}
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
