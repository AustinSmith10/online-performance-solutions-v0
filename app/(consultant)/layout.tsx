import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { NotificationToasts } from "@/components/NotificationToasts";
import { MobileNav } from "@/components/MobileNav";
import { ConsultantSidebar } from "@/components/ConsultantSidebar";
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
        notifications={<NotificationTrayServer projectBasePath="/ops/projects" align="right" />}
      />

      {/* Desktop sidebar (hidden on mobile) — collapsible, only 2 nav items don't need a fixed 224px rail */}
      <ConsultantSidebar
        navItems={NAV_ITEMS}
        userName={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
        logoutAction={logout}
        notifications={<NotificationTrayServer projectBasePath="/ops/projects" />}
      />

      {/* Main — min-w-0 prevents flex children from overflowing */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      <RealtimeRefresh userId={user.id as string} />
      <NotificationToasts
        userId={user.id as string}
        projectBasePath="/ops/projects"
        align="right"
      />
    </div>
  );
}

