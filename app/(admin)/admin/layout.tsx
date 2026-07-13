import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminNavRestrictions, type AdminNavKey } from "@/lib/settings/admin-nav-restrictions";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { NotificationToasts } from "@/components/NotificationToasts";
import { MobileNav } from "@/components/MobileNav";
import { SidebarNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { ReplayTourButton } from "@/components/onboarding-tour/ReplayTourButton";

const ALL_NAV_ITEMS: { href: string; label: string; group?: string; key?: AdminNavKey }[] = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/clients", label: "Clients", group: "Work", key: "clients" },
  { href: "/admin/projects", label: "Projects", group: "Work", key: "projects" },
  { href: "/admin/stakeholders", label: "Stakeholders", group: "Work", key: "stakeholders" },
  { href: "/admin/users", label: "Internal Users", group: "Work", key: "users" },
  { href: "/admin/templates", label: "Templates", group: "Admin", key: "templates" },
  { href: "/admin/credits", label: "Credits", group: "Admin", key: "credits" },
  { href: "/admin/audit", label: "Audit", group: "Admin", key: "audit" },
  { href: "/admin/recovery", label: "Recovery Bin", group: "Admin", key: "recovery" },
  { href: "/admin/system-health", label: "System Health", group: "Admin", key: "system-health" },
  { href: "/admin/settings", label: "Settings", group: "Admin", key: "settings" },
];

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("super_admin", "admin");

  let NAV_ITEMS = ALL_NAV_ITEMS;
  if (user.role !== "super_admin") {
    const restricted = await getAdminNavRestrictions(createAdminClient());
    NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => !item.key || !restricted.includes(item.key));
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Mobile top bar + drawer (hidden on desktop) */}
      <MobileNav
        title="OPS Admin"
        navItems={NAV_ITEMS}
        userName={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
        profileHref="/admin/profile"
        logoutAction={logout}
        notifications={
          <NotificationTrayServer
            projectBasePath="/admin/projects"
            includeNeedsAttention
            align="right"
          />
        }
      />

      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
          <span className="text-sm font-semibold text-zinc-900">OPS Admin</span>
          <div className="flex items-center gap-1">
            <NotificationTrayServer projectBasePath="/admin/projects" includeNeedsAttention />
          </div>
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
          <ReplayTourButton
            href="/admin/dashboard"
            className="mb-1 block w-full rounded px-3 py-1.5 text-left text-sm text-zinc-600 hover:bg-zinc-100"
          />
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
      <NotificationToasts
        userId={user.id as string}
        projectBasePath="/admin/projects"
        includeNeedsAttention
        align="right"
      />
    </div>
  );
}

