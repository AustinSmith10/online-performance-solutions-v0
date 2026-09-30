import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminNavRestrictions, type AdminNavKey } from "@/lib/settings/admin-nav-restrictions";
import { getPendingEmailQueueCount } from "@/lib/email/queue-pending-count";
import { EmailsDisabledBanner } from "@/components/EmailsDisabledBanner";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { NotificationToasts } from "@/components/NotificationToasts";
import { MobileNav } from "@/components/MobileNav";
import { SidebarNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { ReplayTourButton } from "@/components/onboarding-tour/ReplayTourButton";
import { Logo } from "@/components/Logo";

const ALL_NAV_ITEMS: { href: string; label: string; group?: string; key?: AdminNavKey; count?: number; superOnly?: boolean }[] = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/clients", label: "Clients", group: "Work", key: "clients" },
  { href: "/admin/projects", label: "Projects", group: "Work", key: "projects" },
  { href: "/admin/stakeholders", label: "Stakeholders", group: "Work", key: "stakeholders" },
  { href: "/admin/users", label: "Internal Users", group: "Work", key: "users" },
  { href: "/admin/email-queue", label: "Email Queue", group: "Work" },
  { href: "/admin/templates", label: "Templates", group: "Admin", key: "templates" },
  { href: "/admin/credits", label: "Credits", group: "Admin", key: "credits" },
  { href: "/admin/audit", label: "Audit", group: "Admin", key: "audit" },
  { href: "/admin/recovery", label: "Recovery Bin", group: "Admin", key: "recovery" },
  { href: "/admin/system-health", label: "System Health", group: "Admin", key: "system-health" },
  { href: "/admin/settings", label: "Settings", group: "Admin", key: "settings" },
];

// Phone-platform layer, matching app/(client)/layout.tsx's PLATFORM: no grey
// tap flash, no double-tap-zoom delay, no long-press text selection on
// button labels, and 16px form fields on touch so iOS Safari never zooms on
// focus. No effect on desktop/mouse input.
const PLATFORM =
  "[-webkit-tap-highlight-color:transparent] [&_a]:touch-manipulation [&_button]:touch-manipulation [&_button]:select-none " +
  "[@media(pointer:coarse)]:[&_input]:text-base [@media(pointer:coarse)]:[&_select]:text-base [@media(pointer:coarse)]:[&_textarea]:text-base";

// The tray (a dozen queries) streams in after the rest of the shell instead of
// blocking it; this holds the bell's place so nothing shifts when it arrives.
function TrayPlaceholder() {
  return <div aria-hidden className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" />;
}

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createAdminClient();

  // Independent lookups, one round trip: the profile/role check and the two nav
  // inputs. The restrictions are fetched even for super admins (they're
  // ignored below) so the query doesn't have to wait for the role first.
  const [user, restrictedForAdmins, pendingQueueCount] = await Promise.all([
    requireRole("super_admin", "admin"),
    getAdminNavRestrictions(supabase),
    getPendingEmailQueueCount(supabase),
  ]);
  const restricted: AdminNavKey[] = user.role !== "super_admin" ? restrictedForAdmins : [];

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(
    (item) => (!item.superOnly || user.role === "super_admin") && (!item.key || !restricted.includes(item.key))
  ).map((item) =>
    item.href === "/admin/email-queue" ? { ...item, count: pendingQueueCount } : item
  );

  return (
    <div className={`flex min-h-dvh flex-col bg-zinc-50 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] lg:h-dvh lg:flex-row lg:overflow-hidden ${PLATFORM}`}>
      {/* Mobile top bar + drawer (hidden on desktop) */}
      <MobileNav
        title="OPS Admin"
        logo={<Logo className="h-6 w-auto" />}
        navItems={NAV_ITEMS}
        userName={[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
        profileHref="/admin/profile"
        logoutAction={logout}
        notifications={
          <Suspense fallback={<TrayPlaceholder />}>
            <NotificationTrayServer
              projectBasePath="/admin/projects"
              includeNeedsAttention
              align="right"
            />
          </Suspense>
        }
      />

      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-4">
          <Logo className="h-6 w-auto" />
          <div className="flex items-center gap-1">
            <Suspense fallback={<TrayPlaceholder />}>
              <NotificationTrayServer projectBasePath="/admin/projects" includeNeedsAttention />
            </Suspense>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <SidebarNavLinks items={NAV_ITEMS} />
        </nav>
        <div className="border-t border-zinc-200 p-3">
          <p className="mb-2 truncate px-2 text-xs text-zinc-600">
            {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
          </p>
          <Link
            href="/admin/profile"
            className="mb-0.5 block rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-700"
          >
            My profile
          </Link>
          <ReplayTourButton
            href="/admin/dashboard"
            className="mb-0.5 block w-full rounded-md px-2 py-1 text-left text-xs text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-700"
          />
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-md px-2 py-1 text-left text-xs text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main — min-w-0 prevents flex children from overflowing */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-8">
        <Suspense>
          <EmailsDisabledBanner role={user.role as string} />
        </Suspense>
        {children}
      </main>
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

