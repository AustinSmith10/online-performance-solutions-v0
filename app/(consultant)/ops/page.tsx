import { requireRole } from "@/lib/auth/session";

export default async function ConsultantOpsPage() {
  const user = await requireRole("consultant", "super_admin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-900">Consultant workspace</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Coming soon — logged in as {user.email}
        </p>
      </div>
    </div>
  );
}
