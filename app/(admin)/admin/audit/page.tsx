import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 50;

// ─── Event taxonomy ──────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; color: string; events: string[] }> = {
  auth: {
    label: "Authentication",
    color: "bg-indigo-100 text-indigo-700",
    events: ["auth.login", "auth.2fa_disabled", "auth.2fa_required"],
  },
  project: {
    label: "Projects",
    color: "bg-blue-100 text-blue-700",
    events: [
      "project.submitted",
      "project.pbdb_generated",
      "project.pbdb_qa_uploaded",
      "project.qa_complete",
      "project.revision_complete",
      "project.dispatched",
      "project.purged",
      "project.soft_deleted",
      "project.restored",
      "project.fields_updated",
      "assignment.created",
      "pbdr.delivered",
      "pbdr.conversion_failed",
      "project.complete",
      "project.pbdr_downloaded",
      "project.pbdb_downloaded",
    ],
  },
  stakeholder: {
    label: "Stakeholders",
    color: "bg-amber-100 text-amber-700",
    events: [
      "stakeholder.responded",
      "stakeholder.waived",
      "stakeholder.token_resent",
      "stakeholder.email_updated",
      "stakeholder.token_accessed",
      "stakeholder.pbdb_downloaded",
    ],
  },
  credit: {
    label: "Credits & Payments",
    color: "bg-emerald-100 text-emerald-700",
    events: [
      "credit.top_up",
      "credit.deduction",
      "credit.deferred_debit",
      "payment.override_applied",
      "payment.override_reconciled",
    ],
  },
  email: {
    label: "Email",
    color: "bg-orange-100 text-orange-700",
    events: [
      "email.draft_created",
      "email.thread_reply_invalid",
      "email.thread_attachments_added",
      "email.unrecognised_sender",
      "email.whitelist_blocked",
      "email.no_attachments",
      "email.duplicate_address",
    ],
  },
  template: {
    label: "Templates",
    color: "bg-purple-100 text-purple-700",
    events: [
      "template.uploaded",
      "template.activated",
      "template.deactivated",
      "template.deleted",
      "template.reuploaded",
      "template.reactivated",
      "template.mapping_updated",
      "template.token_added",
      "template.token_deleted",
    ],
  },
  org: {
    label: "Organisations",
    color: "bg-zinc-200 text-zinc-700",
    events: ["org.created", "org.updated", "org.config_updated", "org.frozen", "org.unfrozen"],
  },
};

const EVENT_LABELS: Record<string, string> = {
  "auth.login": "User logged in",
  "auth.2fa_disabled": "2FA disabled",
  "auth.2fa_required": "2FA enforced",
  "project.submitted": "Project submitted",
  "project.pbdb_generated": "PBDB generated",
  "project.pbdb_qa_uploaded": "QA document uploaded",
  "project.qa_complete": "QA marked complete",
  "project.revision_complete": "Revision complete",
  "project.dispatched": "Project dispatched to stakeholders",
  "project.purged": "Project permanently deleted",
  "project.soft_deleted": "Project archived",
  "project.restored": "Project restored",
  "project.fields_updated": "Project fields edited",
  "assignment.created": "Consultant assigned",
  "pbdr.delivered": "PBDR delivered to client",
  "pbdr.conversion_failed": "PBDR conversion failed",
  "project.complete": "Project marked complete",
  "project.pbdr_downloaded": "Client downloaded PBDR",
  "project.pbdb_downloaded": "PBDB downloaded",
  "stakeholder.responded": "Stakeholder responded",
  "stakeholder.waived": "Stakeholder review waived",
  "stakeholder.token_resent": "Access link resent",
  "stakeholder.email_updated": "Stakeholder email changed",
  "stakeholder.token_accessed": "Stakeholder opened approval link",
  "stakeholder.pbdb_downloaded": "Stakeholder downloaded PBDB",
  "credit.top_up": "Credits added",
  "credit.deduction": "Credits deducted",
  "credit.deferred_debit": "Deferred debit recorded",
  "payment.override_applied": "Payment override applied",
  "payment.override_reconciled": "Payment override reconciled",
  "email.draft_created": "Project submitted via email",
  "email.thread_reply_invalid": "Invalid email reply rejected",
  "email.thread_attachments_added": "Attachments added via email",
  "email.unrecognised_sender": "Email from unknown sender",
  "email.whitelist_blocked": "Sender not on allowlist",
  "email.no_attachments": "Email received with no attachments",
  "email.duplicate_address": "Duplicate site address detected",
  "template.uploaded": "Template uploaded",
  "template.activated": "Template activated",
  "template.deactivated": "Template deactivated",
  "template.deleted": "Template deleted",
  "template.reuploaded": "Template file replaced",
  "template.reactivated": "Template reactivated",
  "template.mapping_updated": "Template mappings updated",
  "template.token_added": "Extraction token added",
  "template.token_deleted": "Extraction token removed",
  "org.created": "Organisation created",
  "org.updated": "Organisation updated",
  "org.config_updated": "Organisation settings changed",
  "org.frozen": "Organisation frozen",
  "org.unfrozen": "Organisation unfrozen",
};

const EVENT_CATEGORY: Record<string, string> = {};
for (const [key, cat] of Object.entries(CATEGORIES)) {
  for (const ev of cat.events) {
    EVENT_CATEGORY[ev] = key;
  }
}

function getCategoryInfo(eventType: string) {
  const key = EVENT_CATEGORY[eventType];
  return key ? { key, ...CATEGORIES[key] } : null;
}

// ─── Metadata → natural language ─────────────────────────────────────────────

function formatDetails(
  eventType: string,
  metadata: Record<string, unknown> | null
): string {
  if (!metadata) return "";
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const n = (v: unknown): number | null => (typeof v === "number" ? v : null);

  const parts: string[] = [];

  switch (eventType) {
    case "auth.login":
      if (s(metadata.role))
        parts.push(`Logged in as ${s(metadata.role).replace(/_/g, " ")}`);
      break;

    case "project.pbdb_generated":
      if (s(metadata.project_number)) parts.push(`Project #${s(metadata.project_number)}`);
      break;

    case "project.revision_complete": {
      const cycle = n(metadata.review_cycle);
      const ver = n(metadata.version);
      if (cycle !== null) parts.push(`Cycle ${cycle}`);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;
    }

    case "project.pbdb_qa_uploaded": {
      const ver = n(metadata.version);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;
    }

    case "project.qa_complete":
      if (s(metadata.project_ref)) parts.push(`Ref: ${s(metadata.project_ref)}`);
      break;

    case "project.submitted":
      if (s(metadata.poNumber)) parts.push(`PO: ${s(metadata.poNumber)}`);
      break;

    case "project.purged":
      if (s(metadata.deletedBy)) parts.push(`Deleted by ${s(metadata.deletedBy)}`);
      break;

    case "assignment.created":
      if (s(metadata.consultant_name)) parts.push(`→ ${s(metadata.consultant_name)}`);
      break;

    case "pbdr.delivered": {
      const ver = n(metadata.pbdr_version);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.triggered_by) === "auto") parts.push("Auto-triggered");
      else if (s(metadata.triggered_by) === "manual") parts.push("Manual trigger");
      break;
    }

    case "pbdr.conversion_failed": {
      const ver = n(metadata.pbdr_version);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.error)) parts.push(s(metadata.error));
      break;
    }

    case "stakeholder.responded":
      if (s(metadata.response)) parts.push(`Response: ${s(metadata.response)}`);
      if (n(metadata.review_cycle) !== null) parts.push(`Cycle ${n(metadata.review_cycle)}`);
      break;

    case "stakeholder.waived":
      if (s(metadata.reason)) parts.push(s(metadata.reason));
      break;

    case "stakeholder.token_resent":
      if (s(metadata.email)) parts.push(s(metadata.email));
      break;

    case "stakeholder.email_updated":
      if (s(metadata.new_email)) parts.push(`→ ${s(metadata.new_email)}`);
      break;

    case "stakeholder.token_accessed":
      if (n(metadata.review_cycle) !== null) parts.push(`Cycle ${n(metadata.review_cycle)}`);
      break;

    case "stakeholder.pbdb_downloaded":
      if (n(metadata.version) !== null) parts.push(`v${n(metadata.version)}`);
      break;

    case "project.complete":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      break;

    case "project.pbdr_downloaded":
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;

    case "project.pbdb_downloaded":
      if (s(metadata.role)) parts.push(s(metadata.role).replace(/_/g, " "));
      if (n(metadata.version) !== null) parts.push(`v${n(metadata.version)}`);
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;

    case "credit.top_up": {
      const amount = n(metadata.amount);
      const bal = n(metadata.balance_after);
      if (amount !== null) parts.push(`+${amount} credits`);
      if (bal !== null) parts.push(`Balance: ${bal}`);
      if (s(metadata.notes)) parts.push(s(metadata.notes));
      break;
    }

    case "credit.deduction": {
      const bal = n(metadata.balance_after);
      if (bal !== null) parts.push(`Balance after: ${bal}`);
      break;
    }

    case "credit.deferred_debit": {
      const bal = n(metadata.deferred_balance_after);
      if (bal !== null) parts.push(`Deferred balance: ${bal}`);
      break;
    }

    case "payment.override_applied":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      if (s(metadata.reason)) parts.push(s(metadata.reason));
      break;

    case "payment.override_reconciled":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      break;

    case "email.draft_created": {
      const atts = metadata.attachments;
      if (Array.isArray(atts))
        parts.push(`${atts.length} attachment${atts.length !== 1 ? "s" : ""}`);
      break;
    }

    case "email.duplicate_address":
      if (s(metadata.site_address)) parts.push(s(metadata.site_address));
      break;

    case "template.uploaded":
    case "template.activated":
    case "template.deactivated":
    case "template.deleted":
    case "template.reuploaded":
    case "template.reactivated":
      if (s(metadata.name)) parts.push(s(metadata.name));
      break;

    case "template.mapping_updated": {
      if (s(metadata.name)) parts.push(s(metadata.name));
      const count = n(metadata.tokenCount);
      if (count !== null) parts.push(`${count} token${count !== 1 ? "s" : ""}`);
      break;
    }

    case "template.token_added":
    case "template.token_deleted":
      if (s(metadata.name)) parts.push(s(metadata.name));
      if (s(metadata.token)) parts.push(`{${s(metadata.token)}}`);
      break;

    case "project.fields_updated": {
      const keys = Object.keys(metadata.updated ?? {});
      if (keys.length > 0) parts.push(keys.join(", "));
      break;
    }

    case "org.created":
    case "org.updated":
      if (s(metadata.name)) parts.push(s(metadata.name));
      if (s(metadata.payment_method))
        parts.push(`(${s(metadata.payment_method).replace(/_/g, " ")})`);
      break;

    case "org.config_updated":
      if (Array.isArray(metadata.keys))
        parts.push(`Updated: ${(metadata.keys as string[]).join(", ")}`);
      break;

    default:
      break;
  }

  return parts.join(" · ");
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

const SORT_COLS = ["created_at", "event_type", "actor_email"] as const;
type SortCol = (typeof SORT_COLS)[number];

function buildSortHref(
  current: Record<string, string | undefined>,
  col: SortCol
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== "page") p.set(k, v); // reset to page 0 on sort change
  }
  const isActive = (current.sort ?? "created_at") === col;
  p.set("sort", col);
  p.set("order", isActive && current.order !== "asc" ? "asc" : "desc");
  return `/admin/audit?${p.toString()}`;
}

function buildPageHref(
  current: Record<string, string | undefined>,
  page: number
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== "page") p.set(k, v);
  }
  if (page > 0) p.set("page", String(page));
  return `/admin/audit?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active)
    return (
      <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">
        ↕
      </span>
    );
  return (
    <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type AuditRow = {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_email: string | null;
  project_id: string | null;
  org_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  project: { project_number: string | null } | null;
  org: { name: string } | null;
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    category?: string;
    event_type?: string;
    org_name?: string;
    from?: string;
    to?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}) {
  const { email, category, event_type, org_name, from, to, sort, order, page } =
    await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol)
    ? (sort as SortCol)
    : "created_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const currentPage = Math.max(0, parseInt(page ?? "0", 10) || 0);
  const currentParams = { email, category, event_type, org_name, from, to, sort, order, page };

  const supabase = createAdminClient();

  // Resolve org name to IDs
  let orgIds: string[] | null = null;
  if (org_name?.trim()) {
    const { data: orgs } = await supabase
      .from("organisations")
      .select("id")
      .ilike("name", `%${org_name.trim()}%`);
    orgIds = orgs?.map((o) => o.id as string) ?? [];
  }

  let entries: AuditRow[] = [];
  let totalCount = 0;

  // Skip query if org filter matched nothing
  if (orgIds === null || orgIds.length > 0) {
    let query = supabase
      .from("audit_log")
      .select("*, project:projects(project_number), org:organisations(name)", { count: "exact" })
      .order(sortCol, { ascending: sortOrder === "asc" })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (email?.trim()) {
      query = query.ilike("actor_email", `%${email.trim()}%`);
    }

    // event_type takes precedence over category
    if (event_type?.trim()) {
      query = query.eq("event_type", event_type.trim());
    } else if (category?.trim() && CATEGORIES[category.trim()]) {
      query = query.in("event_type", CATEGORIES[category.trim()].events);
    }

    if (orgIds !== null && orgIds.length > 0) {
      query = query.in("org_id", orgIds);
    }

    if (from?.trim()) {
      query = query.gte("created_at", new Date(from.trim()).toISOString());
    }
    if (to?.trim()) {
      const toDate = new Date(to.trim());
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt("created_at", toDate.toISOString());
    }

    const { data, count } = await query;
    entries = (data ?? []) as AuditRow[];
    totalCount = count ?? 0;
  }

  const hasFilter = email || category || event_type || org_name || from || to;
  const activeCat = category?.trim() && CATEGORIES[category.trim()] ? category.trim() : null;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const rangeStart = totalCount === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Audit trail</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Immutable system event log.{" "}
          {totalCount > 0
            ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount.toLocaleString()} entries.`
            : "No entries found."}
        </p>
      </div>

      {/* Filter form */}
      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Category
            </label>
            <select
              name="category"
              defaultValue={category ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Event type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Event
            </label>
            <select
              name="event_type"
              defaultValue={event_type ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <option value="">All events</option>
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <optgroup key={key} label={cat.label}>
                  {cat.events.map((ev) => (
                    <option key={ev} value={ev}>
                      {EVENT_LABELS[ev] ?? ev}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Actor email */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Actor email
            </label>
            <input
              type="text"
              name="email"
              defaultValue={email ?? ""}
              placeholder="e.g. user@example.com"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>

          {/* Org name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Organisation
            </label>
            <input
              type="text"
              name="org_name"
              defaultValue={org_name ?? ""}
              placeholder="Organisation name"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              From
            </label>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              To
            </label>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
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
              Clear filters
            </a>
          )}
          {hasFilter && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>Active:</span>
              {activeCat && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORIES[activeCat].color}`}>
                  {CATEGORIES[activeCat].label}
                </span>
              )}
              {event_type && (
                <span className="rounded bg-zinc-100 px-2 py-0.5">
                  {EVENT_LABELS[event_type] ?? event_type}
                </span>
              )}
              {email && <span className="rounded bg-zinc-100 px-2 py-0.5">Email: {email}</span>}
              {org_name && (
                <span className="rounded bg-zinc-100 px-2 py-0.5">Org: {org_name}</span>
              )}
              {from && <span className="rounded bg-zinc-100 px-2 py-0.5">From {from}</span>}
              {to && <span className="rounded bg-zinc-100 px-2 py-0.5">To {to}</span>}
            </div>
          )}
        </div>
      </form>

      {/* Results */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No audit entries found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                {(
                  [
                    { label: "Timestamp", col: "created_at" },
                    { label: "Event", col: "event_type" },
                    { label: "Actor", col: "actor_email" },
                  ] as { label: string; col: SortCol }[]
                ).map(({ label, col }) => (
                  <th key={col} className="px-5 py-3 text-left font-medium text-zinc-500">
                    <a
                      href={buildSortHref(currentParams, col)}
                      className="group inline-flex items-center hover:text-zinc-700"
                    >
                      {label}
                      <SortIcon active={sortCol === col} order={sortOrder} />
                    </a>
                  </th>
                ))}
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Project</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {entries.map((entry) => {
                const catInfo = getCategoryInfo(entry.event_type);
                const label = EVENT_LABELS[entry.event_type] ?? entry.event_type;
                const details = formatDetails(entry.event_type, entry.metadata);
                const orgName = entry.org?.name ?? "—";
                const projectNumber = entry.project?.project_number;

                return (
                  <tr key={entry.id} className="hover:bg-blue-50">
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
                    <td className="px-5 py-3 text-xs text-zinc-600">
                      {entry.actor_email ??
                        (entry.actor_id ? entry.actor_id.slice(0, 8) + "…" : "—")}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-700">{orgName}</td>
                    <td className="px-5 py-3 text-xs text-zinc-700">
                      {projectNumber
                        ? `#${projectNumber}`
                        : entry.project_id
                          ? entry.project_id.slice(0, 8) + "…"
                          : "—"}
                    </td>
                    <td className="max-w-[220px] px-5 py-3 text-xs text-zinc-500">
                      <span className="line-clamp-2">{details || "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-5 py-3">
          <p className="text-xs text-zinc-500">
            Page {currentPage + 1} of {totalPages} &middot;{" "}
            {totalCount.toLocaleString()} total entries
          </p>
          <div className="flex gap-2">
            {currentPage > 0 ? (
              <a
                href={buildPageHref(currentParams, currentPage - 1)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                ← Previous
              </a>
            ) : (
              <span className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-300">
                ← Previous
              </span>
            )}
            {currentPage < totalPages - 1 ? (
              <a
                href={buildPageHref(currentParams, currentPage + 1)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Next →
              </a>
            ) : (
              <span className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-300">
                Next →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
