import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm } from "./_components/invite-user-form";
import type { Client } from "@/types";
import { BackLink } from "@/components/BackLink";

export default async function InviteUserPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const caller = await requireRole("super_admin", "admin");
  const { client_id } = await searchParams;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const orgs = (data ?? []) as Pick<Client, "id" | "name">[];

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <BackLink href="/admin/users">Users</BackLink>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">
          Create account
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          The account is created immediately and a welcome email with a password-setup link is sent to the user.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <InviteUserForm orgs={orgs} preselectedOrgId={client_id} callerRole={caller.role as string} />
      </div>
    </div>
  );
}
