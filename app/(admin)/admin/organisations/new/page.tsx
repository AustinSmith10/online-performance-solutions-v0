import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { CreateOrgForm } from "./_components/create-org-form";

export default async function NewOrganisationPage() {
  const user = await requireRole("super_admin", "admin");
  if (user.role !== "super_admin") redirect("/admin/organisations");
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href="/admin/organisations"
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Organisations
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">
          New organisation
        </h1>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <CreateOrgForm />
      </div>
    </div>
  );
}
