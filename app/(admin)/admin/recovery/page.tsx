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

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "deleted_at") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/recovery?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
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

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search address or PO number…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <input
            type="text"
            name="org"
            defaultValue={params.org ?? ""}
            placeholder="Client…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">All statuses</option>
            {(Object.entries(STATUS_LABELS) as [ProjectStatus, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/recovery"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No deleted projects match your filters." : "Recovery bin is empty."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Address / ID</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "status")} className="group inline-flex items-center hover:text-zinc-700">
                    Status at deletion <SortIcon active={sortCol === "status"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "deleted_at")} className="group inline-flex items-center hover:text-zinc-700">
                    Deleted <SortIcon active={sortCol === "deleted_at"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Days remaining</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {projects.map((p) => {
                const days = daysRemaining(p.deleted_at);
                const addr = p.site_address;
                const label = (p.project_number && addr)
                  ? `${p.project_number} — ${addr}`
                  : addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
                return (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      <Link href={`/admin/projects/${p.id}`} className="hover:underline">
                        {label}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{p.clients?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-500">{STATUS_LABELS[p.status]}</td>
                    <td className="px-5 py-3 text-zinc-500">
                      {new Date(p.deleted_at).toLocaleDateString("en-AU")}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-medium ${days <= 3 ? "text-red-600" : "text-zinc-500"}`}>
                        {days} {days === 1 ? "day" : "days"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <RestoreButton projectId={p.id} />
                        <PurgeButton projectId={p.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-zinc-400">{projects.length} deleted project{projects.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      <EntitySection
        title="Deleted templates"
        rows={templates}
        empty="No deleted templates."
        columns={["Name", "Client", "Deleted"]}
        renderRow={(t) => (
          <tr key={t.id}>
            <td className="px-5 py-3 font-medium text-zinc-900">{t.name}</td>
            <td className="px-5 py-3 text-zinc-600">{t.clients?.name ?? "—"}</td>
            <td className="px-5 py-3 text-zinc-500">{new Date(t.deleted_at).toLocaleDateString("en-AU")}</td>
            <td className="px-5 py-4 text-right">
              <EntityRestoreButton action={restoreTemplate.bind(null, t.id)} />
            </td>
          </tr>
        )}
      />

      <EntitySection
        title="Deleted stakeholders"
        rows={stakeholders}
        empty="No deleted stakeholders."
        columns={["Name", "Email", "Scope", "Deleted"]}
        renderRow={(s) => (
          <tr key={s.id}>
            <td className="px-5 py-3 font-medium text-zinc-900">{s.name}</td>
            <td className="px-5 py-3 text-zinc-600">{s.email}</td>
            <td className="px-5 py-3 text-zinc-500 capitalize">{s.scope}</td>
            <td className="px-5 py-3 text-zinc-500">{new Date(s.deleted_at).toLocaleDateString("en-AU")}</td>
            <td className="px-5 py-4 text-right">
              <StakeholderRestoreButton scope={s.scope} scopeId={s.scope_id} stakeholderId={s.id} />
            </td>
          </tr>
        )}
      />

      <EntitySection
        title="Deleted users"
        rows={users}
        empty="No deleted users."
        columns={["Name", "Role", "Client", "Deleted"]}
        renderRow={(u) => (
          <tr key={u.id}>
            <td className="px-5 py-3 font-medium text-zinc-900">
              {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
            </td>
            <td className="px-5 py-3 text-zinc-500 capitalize">{u.role.replace("_", " ")}</td>
            <td className="px-5 py-3 text-zinc-600">{u.clients?.name ?? "—"}</td>
            <td className="px-5 py-3 text-zinc-500">{new Date(u.deleted_at).toLocaleDateString("en-AU")}</td>
            <td className="px-5 py-4 text-right">
              <EntityRestoreButton action={restoreDeletedUser.bind(null, u.id)} />
            </td>
          </tr>
        )}
      />

      <EntitySection
        title="Deleted clients"
        rows={clients}
        empty="No deleted clients."
        columns={["Name", "Deleted"]}
        renderRow={(c) => (
          <tr key={c.id}>
            <td className="px-5 py-3 font-medium text-zinc-900">{c.name}</td>
            <td className="px-5 py-3 text-zinc-500">{new Date(c.deleted_at).toLocaleDateString("en-AU")}</td>
            <td className="px-5 py-4 text-right">
              {canRestoreClients ? (
                <EntityRestoreButton action={restoreClient.bind(null, c.id)} />
              ) : (
                <span className="text-xs text-zinc-400">Super admin only</span>
              )}
            </td>
          </tr>
        )}
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

function EntitySection<T>({
  title,
  rows,
  empty,
  columns,
  renderRow,
}: {
  title: string;
  rows: T[];
  empty: string;
  columns: string[];
  renderRow: (row: T) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
          {empty}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-5 py-3 text-left font-medium text-zinc-500">{c}</th>
                ))}
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">{rows.map(renderRow)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
