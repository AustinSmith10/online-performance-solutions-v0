import { EVENT_LABELS, getCategoryInfo, formatDetails } from "@/lib/audit/taxonomy";

export type ProjectAuditRow = {
  id: string;
  event_type: string;
  actor_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function ProjectAuditTrail({ entries }: { entries: ProjectAuditRow[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
        No audit entries recorded for this project yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50">
          <tr>
            <th className="px-5 py-3 text-left font-medium text-zinc-500">Timestamp</th>
            <th className="px-5 py-3 text-left font-medium text-zinc-500">Event</th>
            <th className="px-5 py-3 text-left font-medium text-zinc-500">Actor</th>
            <th className="px-5 py-3 text-left font-medium text-zinc-500">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {entries.map((entry) => {
            const catInfo = getCategoryInfo(entry.event_type);
            const label = EVENT_LABELS[entry.event_type] ?? entry.event_type;
            const details = formatDetails(entry.event_type, entry.metadata);

            return (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-500">
                  {new Date(entry.created_at).toLocaleString("en-AU", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-zinc-800">{label}</span>
                    {catInfo && (
                      <span
                        className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${catInfo.color}`}
                      >
                        {catInfo.label}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-zinc-600">{entry.actor_email ?? "—"}</td>
                <td className="max-w-[420px] whitespace-normal break-words px-5 py-3 text-xs text-zinc-500">
                  {details || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
