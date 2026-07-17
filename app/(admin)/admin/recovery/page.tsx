import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { RestoreButton } from "./_components/RestoreButton";
import { PurgeButton } from "./_components/PurgeButton";
import { EntityRestoreButton } from "./_components/EntityRestoreButton";
import { StakeholderRestoreButton } from "./_components/StakeholderRestoreButton";
import { restoreTemplate } from "@/app/actions/templates";
import { restoreDeletedUser } from "@/app/actions/admin-users";
import { restoreClient } from "@/app/actions/clients";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  dispatched: "Awaiting Approval",
  revision_required: "Revision Required",
  converting: "Converting to PBDR",
  delivered: "Delivered",
  complete: "Complete",
  paused: "Paused",
};

type DeletedProject = {
  id: string;
  project_number: string | null;
  po_number: string | null;
  site_address: string | null;
  status: ProjectStatus;
  deleted_at: string;
  clients: { name: string } | null;
};

type DeletedTemplate = {
  id: string;
  name: string;
  deleted_at: string;
  clients: { name: string } | null;
};

type DeletedStakeholder = {
  id: string;
  name: string;
  email: string;
  scope: "org" | "project";
  scope_id: string;
  deleted_at: string;
};

type DeletedUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  deleted_at: string;
  clients: { name: string } | null;
};

type DeletedClient = {
  id: string;
  name: string;
  deleted_at: string;
};

function daysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

const SORT_COLS = ["deleted_at", "status"] as const;
type SortCol = (typeof SORT_COLS)[number];
const SORT_OPTIONS: { col: SortCol; label: string }[] = [
  { col: "deleted_at", label: "Deleted" },
  { col: "status", label: "Status at deletion" },
];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "deleted_at") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/recovery?${p.toString()}`;
}

function SortPills({ params, sortCol, sortOrder }: { params: Record<string, string | undefined>; sortCol: SortCol; sortOrder: "asc" | "desc" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-400">Sort:</span>
      {SORT_OPTIONS.map((o) => {
        const active = sortCol === o.col;
        return (
          <a
            key={o.col}
            href={sortHref(params, o.col)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {o.label} {active ? (sortOrder === "asc" ? "↑" : "↓") : ""}
          </a>
        );
      })}
    </div>
  );
}

export default async function AdminRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; status?: string; sort?: string; order?: string }>;
}) {
  const actor = await requireRole("super_admin", "admin");

  const { q, org, status, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "deleted_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const params = { q, org, status, sort, order };

  const supabase = createAdminClient();

  const [
    { data: templateRows },
    { data: stakeholderRows },
    { data: userRows },
    { data: clientRows },
  ] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, deleted_at, clients:client_id(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("stakeholders")
      .select("id, name, email, scope, scope_id, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, email, first_name, last_name, role, deleted_at, clients(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, name, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
  ]);

  const deletedTemplates = (templateRows ?? []) as unknown as DeletedTemplate[];
  const deletedStakeholders = (stakeholderRows ?? []) as unknown as DeletedStakeholder[];
  const deletedUsers = (userRows ?? []) as unknown as DeletedUser[];
  const deletedClients = (clientRows ?? []) as unknown as DeletedClient[];

  let orgIds: string[] | null = null;
  if (org?.trim()) {
    const { data: matched } = await supabase
      .from("clients")
      .select("id")
      .ilike("name", `%${org.trim()}%`);
    orgIds = matched?.map((o) => o.id as string) ?? [];
  }

  let query = supabase
    .from("projects")
    .select("id, project_number, po_number, site_address, status, deleted_at, clients(name)")
    .not("deleted_at", "is", null)
    .order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) {
    query = query.or(`site_address.ilike.%${q.trim()}%,po_number.ilike.%${q.trim()}%`);
  }
  if (status?.trim()) query = query.eq("status", status.trim());
  if (orgIds !== null) {
    if (orgIds.length === 0) {
      return (
        <RecoveryLayout
          projects={[]}
          params={params}
          sortCol={sortCol}
          sortOrder={sortOrder}
          hasFilter
          templates={deletedTemplates}
          stakeholders={deletedStakeholders}
          users={deletedUsers}
          clients={deletedClients}
          canRestoreClients={actor.role === "super_admin"}
        />
      );
    }
    query = query.in("client_id", orgIds);
  }

  const { data } = await query;
  const projects = (data ?? []) as unknown as DeletedProject[];
  const hasFilter = !!(q || org || status);

  return (
    <RecoveryLayout
      projects={projects}
      params={params}
      sortCol={sortCol}
      sortOrder={sortOrder}
      hasFilter={hasFilter}
      templates={deletedTemplates}
      stakeholders={deletedStakeholders}
      users={deletedUsers}
      clients={deletedClients}
      canRestoreClients={actor.role === "super_admin"}
    />
  );
}

function RecoveryLayout({
  projects,
  params,
  sortCol,
  sortOrder,
  hasFilter,
  templates,
  stakeholders,
  users,
  clients,
  canRestoreClients,
}: {
  projects: DeletedProject[];
  params: Record<string, string | undefined>;
  sortCol: SortCol;
  sortOrder: "asc" | "desc";
  hasFilter: boolean;
  templates: DeletedTemplate[];
  stakeholders: DeletedStakeholder[];
  users: DeletedUser[];
  clients: DeletedClient[];
  canRestoreClients: boolean;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Recovery bin</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          All clients&apos; deleted projects. Permanently purged after 30 days.
        </p>
      </div>

      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search address or PO number…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <input
            type="text"
            name="org"
            defaultValue={params.org ?? ""}
            placeholder="Client…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All statuses</option>
            {(Object.entries(STATUS_LABELS) as [ProjectStatus, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/recovery"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No deleted projects match your filters." : "Recovery bin is empty."}
        </div>
      ) : (
        <div className="space-y-2">
          <SortPills params={params} sortCol={sortCol} sortOrder={sortOrder} />
          <div className="overflow-hidden rounded-lg">
            {projects.map((p) => {
              const days = daysRemaining(p.deleted_at);
              const addr = p.site_address;
              const label = (p.project_number && addr)
                ? `${p.project_number} — ${addr}`
                : addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 ${
                    days <= 3 ? "border-l-red-400" : "border-l-zinc-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/projects/${p.id}`} className="truncate text-sm font-medium text-zinc-900 hover:underline">
                      {label}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {p.clients?.name ?? "—"} · {STATUS_LABELS[p.status]} · Deleted {new Date(p.deleted_at).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`whitespace-nowrap text-xs font-medium ${days <= 3 ? "text-red-600" : "text-zinc-500"}`}>
                      {days} {days === 1 ? "day" : "days"}
                    </span>
                    <div className="flex items-center gap-2">
                      <RestoreButton projectId={p.id} />
                      <PurgeButton projectId={p.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-400">{projects.length} deleted project{projects.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      <EntityRowList
        title="Deleted templates"
        rows={templates}
        empty="No deleted templates."
        renderRow={(t) => ({
          key: t.id,
          primary: t.name,
          meta: `${t.clients?.name ?? "—"} · Deleted ${new Date(t.deleted_at).toLocaleDateString("en-AU")}`,
          action: <EntityRestoreButton action={restoreTemplate.bind(null, t.id)} />,
        })}
      />

      <EntityRowList
        title="Deleted stakeholders"
        rows={stakeholders}
        empty="No deleted stakeholders."
        renderRow={(s) => ({
          key: s.id,
          primary: s.name,
          meta: `${s.email} · ${s.scope === "org" ? "Org" : "Project"} scope · Deleted ${new Date(s.deleted_at).toLocaleDateString("en-AU")}`,
          action: <StakeholderRestoreButton scope={s.scope} scopeId={s.scope_id} stakeholderId={s.id} />,
        })}
      />

      <EntityRowList
        title="Deleted users"
        rows={users}
        empty="No deleted users."
        renderRow={(u) => ({
          key: u.id,
          primary: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
          meta: `${u.role.replace("_", " ")} · ${u.clients?.name ?? "—"} · Deleted ${new Date(u.deleted_at).toLocaleDateString("en-AU")}`,
          action: <EntityRestoreButton action={restoreDeletedUser.bind(null, u.id)} />,
        })}
      />

      <EntityRowList
        title="Deleted clients"
        rows={clients}
        empty="No deleted clients."
        renderRow={(c) => ({
          key: c.id,
          primary: c.name,
          meta: `Deleted ${new Date(c.deleted_at).toLocaleDateString("en-AU")}`,
          action: canRestoreClients ? (
            <EntityRestoreButton action={restoreClient.bind(null, c.id)} />
          ) : (
            <span className="text-xs text-zinc-400">Super admin only</span>
          ),
        })}
      />
      {clients.length > 0 && (
        <p className="text-xs text-zinc-400">
          Restoring a client also restores the templates, stakeholders, and projects that were
          deleted alongside it.
        </p>
      )}
    </div>
  );
}

function EntityRowList<T>({
  title,
  rows,
  empty,
  renderRow,
}: {
  title: string;
  rows: T[];
  empty: string;
  renderRow: (row: T) => { key: string; primary: ReactNode; meta: string; action: ReactNode };
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
          {empty}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg">
          {rows.map((row) => {
            const { key, primary, meta, action } = renderRow(row);
            return (
              <div key={key} className="flex items-center gap-3 border-l-4 border-l-zinc-200 border-y border-r border-zinc-200 bg-white px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">{primary}</span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{meta}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">{action}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
