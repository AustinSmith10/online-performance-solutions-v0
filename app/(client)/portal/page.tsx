import { requireRole } from "@/lib/auth/session";

export default async function ClientPortalPage() {
  const user = await requireRole("client");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-900">Client portal</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Coming soon — logged in as {user.email}
        </p>
      </div>
    </div>
  );
}
