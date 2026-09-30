import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailsEnabled } from "@/lib/settings/emails-enabled";

// Streamed inside a <Suspense> by the admin layout so the "emails enabled"
// lookup doesn't hold up the sidebar and the page. Renders nothing while
// emails are on (the normal case).
export async function EmailsDisabledBanner({ role }: { role: string }) {
  const emailsEnabled = await getEmailsEnabled(createAdminClient());
  if (emailsEnabled) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="font-semibold">Outbound emails are disabled.</span> No emails are being
      sent to anyone right now.{" "}
      {role === "super_admin" ? (
        <Link href="/admin/settings" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 transition-colors duration-150 hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
          Turn back on in Settings
        </Link>
      ) : (
        "Ask a super admin to turn it back on in Settings when you're done testing."
      )}
    </div>
  );
}
