import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("client");

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-zinc-900">OPS</span>
            <nav className="flex gap-0.5">
              <NavLink href="/portal">My Reports</NavLink>
              <NavLink href="/portal/history">Report History</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationTrayServer />
            <p className="hidden text-xs text-zinc-400 sm:block">{user.email}</p>
            <form action={logout}>
              <button
                type="submit"
                className="rounded px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
    >
      {children}
    </Link>
  );
}
