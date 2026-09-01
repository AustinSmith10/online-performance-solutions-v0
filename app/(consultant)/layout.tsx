import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { AccessNoticeBanner } from "@/components/AccessNoticeBanner";
import { logout } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPendingEmailQueueCount } from "@/lib/email/queue-pending-count";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { NotificationToasts } from "@/components/NotificationToasts";
import { TopNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { AvailabilityPill } from "@/components/AvailabilityPill";
import { Logo } from "@/components/Logo";
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
              <Logo className="h-6 w-auto shrink-0" />
              <nav className="hidden sm:flex gap-4">
                <TopNavLinks items={NAV_ITEMS} />
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ReplayTourButton
                href="/ops"
                className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 text-xs font-semibold text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
              >
                ?
              </ReplayTourButton>
              <NotificationTrayServer projectBasePath="/ops/projects" align="right" />
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
      <Suspense>
        <AccessNoticeBanner />
      </Suspense>
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
