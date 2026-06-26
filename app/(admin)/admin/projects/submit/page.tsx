import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmissionForm } from "@/app/(client)/portal/submit/_components/SubmissionForm";

type FileRequirement = {
  id: string;
  name: string;
  slug: string;
  max_count: number;
  required: boolean;
  no_duplicates: boolean;
  extraction: boolean;
  template_id: string;
};

type ClientUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

export default async function AdminSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ org_id?: string; client_id?: string }>;
}) {
  await requireRole("super_admin");
  const { org_id: orgId, client_id: clientId } = await searchParams;
  const supabase = createAdminClient();

  const { data: orgs } = await supabase
    .from("organisations")
    .select("id, name")
    .order("name");

  const organisations = (orgs ?? []) as { id: string; name: string }[];

  // ── Step 1: pick organisation ────────────────────────────────────────────────
  if (!orgId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <Link href="/admin/projects" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Projects
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">Submit project on behalf of client</h1>
          <p className="mt-1 text-sm text-zinc-500">Select the organisation to submit for.</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <form method="GET" className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Organisation <span className="text-red-500">*</span>
              </label>
              {organisations.length === 0 ? (
                <p className="text-sm text-zinc-500">No organisations found.</p>
              ) : (
                <select
                  name="org_id"
                  required
                  defaultValue=""
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="" disabled>Select an organisation…</option>
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              )}
            </div>
            {organisations.length > 0 && (
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Continue
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  const selectedOrg = organisations.find((o) => o.id === orgId);
  if (!selectedOrg) notFound();

  // ── Step 2: pick client account within the organisation ──────────────────────
  if (!clientId) {
    const { data: clientsData } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("org_id", orgId)
      .eq("role", "client")
      .order("first_name")
      .order("last_name");

    const clients = (clientsData ?? []) as ClientUser[];

    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <Link href="/admin/projects/submit" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Change organisation
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">
            Submit project — {selectedOrg.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Select the client account this submission is being made on behalf of.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          {clients.length === 0 ? (
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-900">No client accounts</p>
              <p className="mt-1 text-sm text-zinc-500">
                {selectedOrg.name} has no registered client accounts.
              </p>
            </div>
          ) : (
            <form method="GET" className="space-y-5">
              <input type="hidden" name="org_id" value={orgId} />
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Client account <span className="text-red-500">*</span>
                </label>
                <select
                  name="client_id"
                  required
                  defaultValue=""
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  <option value="" disabled>Select a client…</option>
                  {clients.map((u) => {
                    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
                    return (
                      <option key={u.id} value={u.id}>
                        {name} — {u.email}
                      </option>
                    );
                  })}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Continue
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Step 3: validate client belongs to org, then show submission form ─────────
  const { data: clientUser } = await supabase
    .from("users")
    .select("id, first_name, last_name, email")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .eq("role", "client")
    .single();

  if (!clientUser) notFound();
  const client = clientUser as ClientUser;
  const clientDisplayName =
    [client.first_name, client.last_name].filter(Boolean).join(" ") || client.email;

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("name");

  const activeTemplates = (templates ?? []) as { id: string; name: string }[];

  if (activeTemplates.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <Link
            href={`/admin/projects/submit?org_id=${orgId}`}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            ← Change client
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">
            Submit project — {selectedOrg.name}
          </h1>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-zinc-900">No active templates</p>
          <p className="mt-1 text-sm text-zinc-500">
            {selectedOrg.name} has no active templates. Activate a template before submitting.
          </p>
          <Link
            href="/admin/templates"
            className="mt-4 inline-block text-sm text-blue-600 underline hover:text-blue-800"
          >
            Manage templates →
          </Link>
        </div>
      </div>
    );
  }

  const templateIds = activeTemplates.map((t) => t.id);
  const { data: allRequirements } = await supabase
    .from("file_requirements")
    .select("id, name, slug, max_count, required, no_duplicates, extraction, template_id")
    .in("template_id", templateIds)
    .order("sort_order", { ascending: true });

  const requirementsByTemplate: Record<string, FileRequirement[]> = {};
  for (const req of (allRequirements ?? []) as FileRequirement[]) {
    if (!requirementsByTemplate[req.template_id]) {
      requirementsByTemplate[req.template_id] = [];
    }
    requirementsByTemplate[req.template_id].push(req);
  }

  const defaultTemplateId = activeTemplates.length === 1 ? activeTemplates[0].id : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <Link
          href={`/admin/projects/submit?org_id=${orgId}`}
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Change client
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">
          Submit project — {selectedOrg.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Submitting on behalf of{" "}
          <span className="font-medium text-zinc-700">{clientDisplayName}</span>{" "}
          ({client.email}).
        </p>
      </div>
      <SubmissionForm
        templates={activeTemplates}
        defaultTemplateId={defaultTemplateId}
        requirementsByTemplate={requirementsByTemplate}
        adminOrgId={orgId}
        adminClientId={clientId}
        projectBasePath="/admin/projects"
        startOverHref={`/admin/projects/submit?org_id=${orgId}`}
      />
    </div>
  );
}
