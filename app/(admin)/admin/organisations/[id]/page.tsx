import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { setOrgFrozen } from "@/app/actions/organisations";
import { EditOrgForm } from "./_components/edit-org-form";
import { OrgConfigForm } from "./_components/org-config-form";
import { EmailWhitelistCard } from "./_components/email-whitelist-card";
import { StakeholderList } from "./_components/stakeholder-list";
import type { Organisation, User } from "@/types";

export default async function OrganisationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: org }, { data: users }, { data: templates }, { data: orgStakeholders }] =
    await Promise.all([
      supabase.from("organisations").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("users")
        .select("id, email, first_name, last_name, role, is_locked, created_at")
        .eq("org_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("templates")
        .select("id, name, status, created_at")
        .eq("org_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("stakeholders")
        .select("id, name, email, company")
        .eq("scope", "org")
        .eq("scope_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  if (!org) notFound();

  const orgData = org as Organisation;
  const orgUsers = (users ?? []) as Pick<
    User,
    "id" | "email" | "first_name" | "last_name" | "role" | "is_locked" | "created_at"
  >[];
  const orgTemplates = (templates ?? []) as {
    id: string; name: string; status: string; created_at: string;
  }[];
  const stakeholderRows = (orgStakeholders ?? []) as {
    id: string; name: string; email: string; company: string | null;
  }[];

  // Fetch all unique ORG_ tokens across this org's templates
  const templateIds = orgTemplates.map((t) => t.id);
  let orgConfigTokens: string[] = [];
  if (templateIds.length > 0) {
    const { data: tokenRows } = await supabase
      .from("template_field_mappings")
      .select("placeholder_token")
      .in("template_id", templateIds)
      .eq("field_key", "org");
    const seen = new Set<string>();
    for (const row of tokenRows ?? []) {
      seen.add((row as { placeholder_token: string }).placeholder_token);
    }
    orgConfigTokens = [...seen].sort();
  }

  const freezeAction = setOrgFrozen.bind(null, id, !orgData.is_frozen);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/admin/organisations"
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Organisations
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">{orgData.name}</h1>
          {orgData.is_frozen && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Frozen
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500">slug: {orgData.slug}</p>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Credit balance
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {orgData.credit_balance.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Credit limit
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {orgData.credit_limit.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Freeze / unfreeze — deferred only */}
      {orgData.payment_method === "deferred" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Account status</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {orgData.is_frozen
              ? "This account is frozen. No further submissions can be made until unfrozen."
              : "Account is active. Freeze to block further submissions for unpaid deferred balances."}
          </p>
          <form action={freezeAction} className="mt-4">
            <button
              type="submit"
              className={
                orgData.is_frozen
                  ? "rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  : "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              }
            >
              {orgData.is_frozen ? "Unfreeze account" : "Freeze account"}
            </button>
          </form>
        </div>
      )}

      {/* Edit form */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-5 text-sm font-semibold text-zinc-900">
          Organisation details
        </h2>
        <EditOrgForm org={orgData} />
      </div>

      {/* Org config */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Org config</h2>
        <p className="mb-5 text-xs text-zinc-500">
          Values for <code className="rounded bg-zinc-100 px-1">ORG_</code> tokens used in this
          org&apos;s templates. Used verbatim when generating documents.
        </p>
        <OrgConfigForm
          orgId={orgData.id}
          tokens={orgConfigTokens}
          currentConfig={orgData.org_config ?? {}}
        />
      </div>

      {/* Email whitelist */}
      <EmailWhitelistCard orgId={orgData.id} domains={orgData.email_whitelist ?? []} />

      {/* Templates */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Templates</h2>
          <Link
            href={`/admin/templates/upload?org_id=${id}`}
            className="text-sm text-zinc-600 hover:underline"
          >
            + Upload template
          </Link>
        </div>

        {orgTemplates.length === 0 ? (
          <p className="text-sm text-zinc-500">No templates yet.</p>
        ) : (
          <table className="w-full text-sm">
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
                      <Link
                        href={`/admin/templates/${t.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyle}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Default stakeholders */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Default stakeholders</h2>
        <p className="mb-5 text-xs text-zinc-500">
          These stakeholders receive the PBDB for approval when no project- or template-level
          override is configured.
        </p>
        <StakeholderList orgId={orgData.id} stakeholders={stakeholderRows} />
      </div>

      {/* Users */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Users</h2>
          <Link
            href={`/admin/users/invite?org_id=${id}`}
            className="text-sm text-zinc-600 hover:underline"
          >
            + Invite user
          </Link>
        </div>

        {orgUsers.length === 0 ? (
          <p className="text-sm text-zinc-500">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
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
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {u.first_name && u.last_name
                        ? `${u.first_name} ${u.last_name}`
                        : u.email}
                    </Link>
                    {(u.first_name || u.last_name) && (
                      <span className="ml-2 text-xs text-zinc-400">{u.email}</span>
                    )}
                  </td>
                  <td className="py-2 text-zinc-600">{u.role}</td>
                  <td className="py-2">
                    {u.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Locked
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
