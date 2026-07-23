import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPendingEmailQueueCount } from "@/lib/email/queue-pending-count";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { NotificationToasts } from "@/components/NotificationToasts";
import { TopNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { AvailabilityPill } from "@/components/AvailabilityPill";
import { ReplayTourButton } from "@/components/onboarding-tour/ReplayTourButton";
import type { ConsultantAvailability } from "@/types";

// Compact single-row top nav — same idiom as the client portal
// (app/(client)/layout.tsx). The old ConsultantSidebar (224px/56px-collapsed
// full-height rail) never earned its keep for a handful of flat links, and
// now that Availability lives in its own floating pill (AvailabilityPill),
// there's only one nav destination left. See NOTES at the bottom of
// app/prototype-client-workspace/page.tsx for the reasoning this followed.
export default async function ConsultantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("consultant");
  const userName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  const pendingQueueCount = await getPendingEmailQueueCount(createAdminClient());
  const NAV_ITEMS = [
    { href: "/ops", label: "Workspace" },
    { href: "/ops/email-queue", label: `Email Queue (${pendingQueueCount})` },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex h-11 items-center justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <span className="shrink-0 text-sm font-semibold text-zinc-900">OPS</span>
              <nav className="hidden sm:flex gap-4">
                <TopNavLinks items={NAV_ITEMS} />
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationTrayServer projectBasePath="/ops/projects" align="right" />
              <ReplayTourButton href="/ops" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5.75.75 0 01.75.75v2.25a.75.75 0 001.5 0v-2.25a2.25 2.25 0 00-2.25-2.25z"
                    clipRule="evenodd"
                  />
                </svg>
              </ReplayTourButton>
              <Link
                href="/ops/profile"
                className="hidden max-w-[160px] truncate text-xs text-zinc-400 hover:text-zinc-700 sm:block"
              >
                {userName}
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <nav className="flex gap-4 border-t border-zinc-100 py-1 sm:hidden">
            <TopNavLinks items={NAV_ITEMS} />
          </nav>
        </div>
      </header>
      <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      <RealtimeRefresh userId={user.id as string} />
      <NotificationToasts
        userId={user.id as string}
        projectBasePath="/ops/projects"
        align="right"
      />
      <AvailabilityPill current={user.availability as ConsultantAvailability} />
    </div>
  );
}
