import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("super_admin");

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white">
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <span className="text-sm font-semibold text-zinc-900">OPS Admin</span>
          <NotificationTrayServer />
        </div>
        <nav className="space-y-0.5 p-3">
          <NavLink href="/admin/organisations">Organisations</NavLink>
          <NavLink href="/admin/users">Users</NavLink>
          <NavLink href="/admin/consultants">Consultants</NavLink>
          <NavLink href="/admin/clients">Clients</NavLink>
          <NavLink href="/admin/projects">Projects</NavLink>
          <NavLink href="/admin/templates">Templates</NavLink>
          <NavLink href="/admin/credits">Credits</NavLink>
          <NavLink href="/admin/audit">Audit</NavLink>
        </nav>
        <div className="absolute bottom-0 w-56 border-t border-zinc-200 bg-white p-3">
          <p className="mb-2 truncate text-xs text-zinc-500">{user.email}</p>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded px-3 py-1.5 text-left text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
    >
      {children}
    </Link>
  );
}
