import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { setOrgFrozen } from "@/app/actions/clients";
import { OrgDetailReadonly } from "./_components/org-detail-readonly";
import { OrgConfigReadonly } from "./_components/org-config-readonly";
import { EmailWhitelistDrawer } from "./_components/email-whitelist-drawer";
import { OrgCreateAccountModal } from "./_components/org-create-account-modal";
import { DeleteOrgButton } from "./_components/delete-org-button";
import { MetricsTablesPanel } from "./_components/metrics-tables-panel";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { UnsavedChangesProvider } from "@/components/UnsavedChangesProvider";
import { ProfileAccordion } from "@/components/workspace/ProfileAccordion";
import { HeaderStatInline } from "@/app/(consultant)/ops/projects/[id]/_components/HeaderStatInline";
import { CollapsibleSection } from "@/app/(consultant)/ops/projects/[id]/_components/CollapsibleSection";
import type { Client, User } from "@/types";
import type { MetricsTable, MetricsRow, TemplateTokenGroup } from "@/app/actions/client-metrics";
import { getClientTemplateTokenGroups } from "@/app/actions/client-metrics";

export default async function OrganisationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const created = sp.created === "1";
  const cleanUrl = `/admin/clients/${id}`;
  const supabase = createAdminClient();
  const caller = await requireRole("super_admin", "admin");

  const [{ data: org }, { data: users }, { data: templates }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("users")
        .select("id, email, first_name, last_name, role, is_locked, created_at")
        .eq("client_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("templates")
        .select("id, name, status, created_at")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

  if (!org) notFound();

  const { data: metricsTables } = await supabase
    .from("client_metrics_tables")
    .select("id, client_id, name, created_at, autofill_enabled, template_id, match_token, match_column_id")
    .eq("client_id", id)
    .order("created_at", { ascending: true });

  const metricsTableIds = (metricsTables ?? []).map((t) => t.id as string);

  let metricsColumns: { id: string; table_id: string; name: string; data_type: string; position: number }[] = [];
  let metricsRows: { id: string; table_id: string; data: Record<string, string | number | null> }[] = [];
  let metricsOutputs: { id: string; table_id: string; output_token: string; output_column_id: string }[] = [];
  let templateTokenGroups: TemplateTokenGroup[] = [];
  if (metricsTableIds.length > 0) {
    const [{ data: cols }, { data: rowsData }, { data: outputsData }, groups] = await Promise.all([
      supabase
        .from("client_metrics_columns")
        .select("id, table_id, name, data_type, position")
        .in("table_id", metricsTableIds)
        .order("position", { ascending: true }),
      supabase
        .from("client_metrics_rows")
        .select("id, table_id, data")
        .in("table_id", metricsTableIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("client_metrics_output_mappings")
        .select("id, table_id, output_token, output_column_id")
        .in("table_id", metricsTableIds),
      getClientTemplateTokenGroups(id),
    ]);
    metricsColumns = cols ?? [];
    metricsRows = rowsData ?? [];
    metricsOutputs = outputsData ?? [];
    templateTokenGroups = groups;
  }

  const metricsTablesWithColumns: MetricsTable[] = (metricsTables ?? []).map((t) => ({
    id: t.id as string,
    client_id: t.client_id as string,
    name: t.name as string,
    created_at: t.created_at as string,
    autofill_enabled: t.autofill_enabled as boolean,
    template_id: t.template_id as string | null,
    match_token: t.match_token as string | null,
    match_column_id: t.match_column_id as string | null,
    columns: metricsColumns
      .filter((c) => c.table_id === t.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        data_type: c.data_type as MetricsTable["columns"][number]["data_type"],
        position: c.position,
      })),
    outputs: metricsOutputs
      .filter((o) => o.table_id === t.id)
      .map((o) => ({ id: o.id, output_token: o.output_token, output_column_id: o.output_column_id })),
  }));

  const rowsByTable: Record<string, MetricsRow[]> = {};
  for (const table of metricsTablesWithColumns) {
    rowsByTable[table.id] = metricsRows
      .filter((r) => r.table_id === table.id)
      .map((r) => ({ id: r.id, table_id: r.table_id, data: r.data }));
  }

  const orgData = org as Client;
  const orgUsers = (users ?? []) as Pick<
    User,
    "id" | "email" | "first_name" | "last_name" | "role" | "is_locked" | "created_at"
  >[];
  const orgTemplates = (templates ?? []) as {
    id: string; name: string; status: string; created_at: string;
  }[];

  // Only tokens genuinely present in the template file (in_template = true).
  const templateIds = orgTemplates.map((t) => t.id);
  let orgConfigTokens: string[] = [];
  if (templateIds.length > 0) {
    const { data: tokenRows } = await supabase
      .from("template_field_mappings")
      .select("placeholder_token")
      .in("template_id", templateIds)
      .eq("field_key", "org")
      .eq("in_template", true);
    const seen = new Set<string>();
    for (const row of tokenRows ?? []) {
      seen.add((row as { placeholder_token: string }).placeholder_token);
    }
    orgConfigTokens = [...seen].sort();
  }

  const freezeAction = setOrgFrozen.bind(null, id, !orgData.is_frozen);

  const header = (
    <div className={`rounded-xl border border-zinc-200 border-l-[3px] ${orgData.is_frozen ? "border-l-red-400" : "border-l-green-500"} bg-white p-5`}>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
          {orgData.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold text-zinc-900">{orgData.name}</h1>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 capitalize">
              {orgData.payment_method === "credit_deduction" ? "Credit deduction" : orgData.payment_method}
            </span>
            {orgData.is_frozen ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Frozen
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Active
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <EmailWhitelistDrawer orgId={orgData.id} domains={orgData.email_whitelist ?? []} />
          <OrgCreateAccountModal
            orgId={orgData.id}
            orgName={orgData.name}
            callerRole={caller.role as string}
          />
          {orgData.payment_method === "deferred" && (
            <form action={freezeAction}>
              <button
                type="submit"
                className={
                  orgData.is_frozen
                    ? "rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    : "rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                }
              >
                {orgData.is_frozen ? "Unfreeze" : "Freeze"}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-x-7 gap-y-1.5 border-t border-zinc-100 pt-3 text-sm">
        <HeaderStatInline label="Credit balance" value={orgData.credit_balance.toLocaleString()} noLeftBorder />
        <HeaderStatInline label="Credit limit" value={orgData.credit_limit.toLocaleString()} />
        <HeaderStatInline label="Delivery days" value={orgData.delivery_working_days} />
        <HeaderStatInline label="Members" value={orgUsers.length} />
      </div>
    </div>
  );

  const overviewContent = (
    <UnsavedChangesProvider>
      <div className="space-y-3">
        <OrgDetailReadonly org={orgData} />
        <OrgConfigReadonly
          orgId={orgData.id}
          tokens={orgConfigTokens}
          currentConfig={orgData.client_config ?? {}}
        />
      </div>
    </UnsavedChangesProvider>
  );

  const templatesContent = (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-end">
        <Link
          href={`/admin/templates/upload?client_id=${id}`}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Upload template
        </Link>
      </div>
      {orgTemplates.length === 0 ? (
        <p className="text-sm text-zinc-500">No templates yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="pb-2 text-left font-medium text-zinc-500">Name</th>
                <th className="pb-2 text-left font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {orgTemplates.map((t) => {
                const badgeStyle =
                  t.status === "active"
                    ? "bg-green-100 text-green-700"
                    : t.status === "draft"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-zinc-100 text-zinc-500";
                return (
                  <tr key={t.id}>
                    <td className="py-2">
                      <Link href={`/admin/templates/${t.id}`} className="font-medium text-zinc-900 hover:underline">
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyle}`}>{t.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const stakeholdersContent = (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      {orgUsers.length === 0 ? (
        <p className="text-sm text-zinc-500">No users yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="pb-2 text-left font-medium text-zinc-500">Name / email</th>
                <th className="pb-2 text-left font-medium text-zinc-500">Role</th>
                <th className="pb-2 text-left font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {orgUsers.map((u) => (
                <tr key={u.id}>
                  <td className="py-2">
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-zinc-900 hover:underline">
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                    </Link>
                    {(u.first_name || u.last_name) && (
                      <span className="ml-2 text-xs text-zinc-400">{u.email}</span>
                    )}
                  </td>
                  <td className="py-2 text-zinc-600">{u.role}</td>
                  <td className="py-2">
                    {u.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
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

  const metricsContent = (
    <MetricsTablesPanel
      clientId={id}
      tables={metricsTablesWithColumns}
      rowsByTable={rowsByTable}
      templateTokenGroups={templateTokenGroups}
    />
  );

  const dangerContent = (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">Delete organisation</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Permanently removes this organisation. All projects must be purged first. Existing user
            accounts are kept but lose org membership.
          </p>
        </div>
        <DeleteOrgButton orgId={orgData.id} orgName={orgData.name} userCount={orgUsers.length} />
      </div>
    </div>
  );

  return (
    <>
      {created && (
        <AdminSuccessBanner
          cleanUrl={cleanUrl}
          title="Client created"
          body="The organisation has been created successfully."
        />
      )}
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/admin/clients" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Clients
        </Link>

        <ProfileAccordion
          header={header}
          sections={[
            {
              id: "overview",
              content: (
                <CollapsibleSection title="Overview" defaultOpen>
                  <div className="p-4">{overviewContent}</div>
                </CollapsibleSection>
              ),
            },
            {
              id: "templates",
              content: (
                <CollapsibleSection title="Templates" defaultOpen={false}>
                  <div className="p-4">{templatesContent}</div>
                </CollapsibleSection>
              ),
            },
            {
              id: "stakeholders",
              content: (
                <CollapsibleSection title="Stakeholders" defaultOpen={false}>
                  <div className="p-4">{stakeholdersContent}</div>
                </CollapsibleSection>
              ),
            },
            {
              id: "metrics",
              content: (
                <CollapsibleSection title="Data tables" defaultOpen={false}>
                  <div className="p-4">{metricsContent}</div>
                </CollapsibleSection>
              ),
            },
            {
              id: "danger",
              content: (
                <CollapsibleSection title="Delete" defaultOpen={false}>
                  <div className="p-4">{dangerContent}</div>
                </CollapsibleSection>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
