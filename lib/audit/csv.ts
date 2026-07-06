import { EVENT_LABELS, getCategoryInfo, formatDetails } from "./taxonomy";
import type { AuditRow } from "./query";

const HEADERS = ["Timestamp", "Event", "Category", "Actor", "Client", "Project", "Details"];

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function auditEntriesToCsv(entries: AuditRow[]): string {
  const rows = entries.map((entry) => {
    const label = EVENT_LABELS[entry.event_type] ?? entry.event_type;
    const catInfo = getCategoryInfo(entry.event_type);
    const details = formatDetails(entry.event_type, entry.metadata);
    const actor = entry.actor_email ?? entry.actor_id ?? "";
    const orgName = entry.org?.name ?? "";
    const projectNumber = entry.project?.project_number ?? entry.project_id ?? "";

    return [
      entry.created_at,
      label,
      catInfo?.label ?? "",
      actor,
      orgName,
      projectNumber,
      details,
    ];
  });

  return [HEADERS, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell ?? ""))).join(","))
    .join("\r\n") + "\r\n";
}
