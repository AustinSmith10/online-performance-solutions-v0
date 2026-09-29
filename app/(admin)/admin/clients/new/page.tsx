import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { CreateOrgForm } from "./_components/create-org-form";
import { BackLink } from "@/components/BackLink";

export default async function NewOrganisationPage() {
  const user = await requireRole("super_admin", "admin");
  if (user.role !== "super_admin") redirect("/admin/clients");
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <BackLink href="/admin/clients">Clients</BackLink>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">
          New client
        </h1>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <CreateOrgForm />
      </div>
    </div>
  );
}
