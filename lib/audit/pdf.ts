import { EVENT_LABELS, getCategoryInfo, formatDetails } from "./taxonomy";
import { convertHtmlToPdf } from "@/lib/documents/pdf";
import type { AuditRow } from "./query";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renders audit entries as a PDF table — a locked-down counterpart to the CSV
 * export (see lib/audit/csv.ts) for cases where the download must not be
 * trivially editable by whoever receives it.
 */
export async function auditEntriesToPdf(entries: AuditRow[], title: string): Promise<Buffer> {
  const rows = entries
    .map((entry) => {
      const label = EVENT_LABELS[entry.event_type] ?? entry.event_type;
      const catInfo = getCategoryInfo(entry.event_type);
      const details = formatDetails(entry.event_type, entry.metadata);
      const actor = entry.actor_email ?? entry.actor_id ?? "—";
      const orgName = entry.org?.name ?? "—";
      const projectNumber = entry.project?.project_number ?? entry.project_id ?? "—";

      return `<tr>
        <td>${escapeHtml(formatTimestamp(entry.created_at))}</td>
        <td>${escapeHtml(label)}${catInfo ? ` <span class="cat">${escapeHtml(catInfo.label)}</span>` : ""}</td>
        <td>${escapeHtml(actor)}</td>
        <td>${escapeHtml(orgName)}</td>
        <td>${escapeHtml(projectNumber)}</td>
        <td>${escapeHtml(details || "—")}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #18181b; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  p.meta { color: #71717a; margin-top: 0; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
  th { background: #fafafa; font-weight: 600; }
  .cat { display: inline-block; margin-top: 2px; padding: 1px 6px; border-radius: 8px; background: #e4e4e7; font-size: 8px; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Generated ${escapeHtml(new Date().toLocaleString("en-AU"))} · ${entries.length} entries</p>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Event</th>
        <th>Actor</th>
        <th>Client</th>
        <th>Project</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  return convertHtmlToPdf(html);
}
