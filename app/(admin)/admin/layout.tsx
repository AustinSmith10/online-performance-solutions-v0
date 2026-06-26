import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { MobileNav } from "@/components/MobileNav";
import { SidebarNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

const ALL_NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", superAdminOnly: false },
  { href: "/admin/organisations", label: "Organisations", superAdminOnly: false },
  { href: "/admin/users", label: "Users", superAdminOnly: false },
  { href: "/admin/consultants", label: "Consultants", superAdminOnly: false },
  { href: "/admin/clients", label: "Clients", superAdminOnly: false },
  { href: "/admin/projects", label: "Projects", superAdminOnly: false },
  { href: "/admin/templates", label: "Templates", superAdminOnly: false },
  { href: "/admin/credits", label: "Credits", superAdminOnly: false },
  { href: "/admin/audit", label: "Audit", superAdminOnly: true },
  { href: "/admin/recovery", label: "Recovery Bin", superAdminOnly: false },
];

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("super_admin", "admin");
  const NAV_ITEMS = user.role === "super_admin"
    ? ALL_NAV_ITEMS
    : ALL_NAV_ITEMS.filter((item) => !item.superAdminOnly);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Mobile top bar + drawer (hidden on desktop) */}
      <MobileNav
        title="OPS Admin"
        navItems={NAV_ITEMS}
        userName={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
        profileHref="/admin/profile"
        logoutAction={logout}
        notifications={<NotificationTrayServer projectBasePath="/admin/projects" align="right" />}
      />

      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <span className="text-sm font-semibold text-zinc-900">OPS Admin</span>
          <NotificationTrayServer projectBasePath="/admin/projects" />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <SidebarNavLinks items={NAV_ITEMS} />
        </nav>
        <div className="border-t border-zinc-200 p-3">
          <p className="mb-1 truncate text-xs text-zinc-500">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}</p>
          <Link
            href="/admin/profile"
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

