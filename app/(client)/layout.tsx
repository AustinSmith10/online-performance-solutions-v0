import { Suspense } from "react";
import type { Viewport } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { AccessNoticeBanner } from "@/components/AccessNoticeBanner";
import { logout } from "@/app/actions/auth";
import { NotificationTrayServer } from "@/components/NotificationTrayServer";
import { NotificationToasts } from "@/components/NotificationToasts";
import { TopNavLinks } from "@/components/NavLinks";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { Logo } from "@/components/Logo";
import { ReplayTourButton } from "@/components/onboarding-tour/ReplayTourButton";

// Paint edge to edge on notched phones (safe-area padding is applied below) and
// colour the browser chrome to match the white header.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#ffffff",
};

// Phone-platform layer: no grey tap flash (every control has its own :active),
// no double-tap-zoom delay on controls, no long-press text selection on button
// labels, and 16px form fields on touch so iOS Safari never zooms on focus.
const PLATFORM =
  "[-webkit-tap-highlight-color:transparent] [&_a]:touch-manipulation [&_button]:touch-manipulation [&_button]:select-none " +
  "[@media(pointer:coarse)]:[&_input]:text-base [@media(pointer:coarse)]:[&_select]:text-base [@media(pointer:coarse)]:[&_textarea]:text-base";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("stakeholder");

  return (
    <div className={`flex min-h-dvh flex-col bg-zinc-50 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] ${PLATFORM}`}>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-5xl px-4">
          {/* Main header row — compact single row; 3 links don't need the
              14px-tall two-row treatment the old header used. */}
          <div className="flex h-11 items-center justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <Logo className="h-6 w-auto shrink-0" />
              {/* Desktop: nav inline */}
              <nav className="hidden sm:flex gap-4">
                <TopNavLinks items={[
                  { href: "/portal", label: "My Reports" },
                  { href: "/portal/history", label: "History" },
                  { href: "/portal/recovery", label: "Recovery" },
                ]} />
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ReplayTourButton
                href="/portal"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 font-semibold text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
              >
                ?
              </ReplayTourButton>
              <NotificationTrayServer projectBasePath="/portal/projects" align="right" />
              <Link
                href="/portal/profile"
                className="hidden max-w-[160px] truncate py-2 text-xs text-zinc-500 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 sm:block"
              >
                {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded px-2 py-2 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {/* Mobile: nav links in a second row */}
          <nav className="flex gap-4 border-t border-zinc-100 py-1 sm:hidden">
            <TopNavLinks items={[
              { href: "/portal", label: "My Reports" },
              { href: "/portal/history", label: "History" },
              { href: "/portal/recovery", label: "Recovery" },
            ]} />
          </nav>
        </div>
      </header>
      <Suspense>
        <AccessNoticeBanner />
      </Suspense>
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

