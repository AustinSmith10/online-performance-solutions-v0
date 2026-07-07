import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { NotificationToasts } from "@/components/NotificationToasts";
import { TopNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("stakeholder");

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4">
          {/* Main header row */}
          <div className="flex h-14 items-center justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="shrink-0 text-sm font-semibold text-zinc-900">OPS</span>
              {/* Desktop: nav inline */}
              <nav className="hidden sm:flex gap-0.5">
                <TopNavLinks items={[
                  { href: "/portal", label: "My Reports" },
                  { href: "/portal/history", label: "History" },
                  { href: "/portal/recovery", label: "Recovery" },
                ]} />
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <NotificationTrayServer projectBasePath="/portal/projects" align="right" />
              <Link
                href="/portal/profile"
                className="hidden max-w-[180px] truncate text-xs text-zinc-400 hover:text-zinc-700 sm:block"
              >
                {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
              </Link>
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
          {/* Mobile: nav links in a second row */}
          <nav className="flex gap-0.5 border-t border-zinc-100 py-1.5 sm:hidden">
            <TopNavLinks items={[
              { href: "/portal", label: "My Reports" },
              { href: "/portal/history", label: "History" },
              { href: "/portal/recovery", label: "Recovery" },
            ]} />
          </nav>
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
      <RealtimeRefresh userId={user.id as string} />
      <NotificationToasts
        userId={user.id as string}
        projectBasePath="/portal/projects"
        align="right"
      />
    </div>
  );
}

