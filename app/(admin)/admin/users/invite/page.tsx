import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm } from "./_components/invite-user-form";
import type { Organisation } from "@/types";

export default async function InviteUserPage({
  searchParams,
}: {
  searchParams: Promise<{ org_id?: string }>;
}) {
  const { org_id } = await searchParams;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organisations")
    .select("id, name")
    .order("name", { ascending: true });

  const orgs = (data ?? []) as Pick<Organisation, "id" | "name">[];

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Users
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">
          Invite user
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          An email invite will be sent. The user sets their password and 2FA on first login.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <InviteUserForm orgs={orgs} preselectedOrgId={org_id} />
      </div>
    </div>
  );
}
