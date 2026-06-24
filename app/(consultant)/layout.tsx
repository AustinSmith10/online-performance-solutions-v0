import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { MobileNav } from "@/components/MobileNav";
import { SidebarNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

const NAV_ITEMS = [
  { href: "/ops", label: "Workspace" },
  { href: "/availability", label: "Availability" },
];

export default async function ConsultantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("consultant");

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Mobile top bar + drawer (hidden on desktop) */}
      <MobileNav
        title="OPS"
        navItems={NAV_ITEMS}
        userName={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
        profileHref="/ops/profile"
        logoutAction={logout}
        notifications={<NotificationTrayServer projectBasePath="/ops/projects" />}
      />

      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <span className="text-sm font-semibold text-zinc-900">OPS</span>
          <NotificationTrayServer projectBasePath="/ops/projects" />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <SidebarNavLinks items={NAV_ITEMS} />
        </nav>
        <div className="border-t border-zinc-200 p-3">
          <p className="mb-1 truncate text-xs text-zinc-500">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}</p>
          <Link
            href="/ops/profile"
            className="mb-1 block rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            My profile
          </Link>
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

      {/* Main — min-w-0 prevents flex children from overflowing */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      <RealtimeRefresh userId={user.id as string} />
    </div>
  );
}

