import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/notify";
import { AcknowledgementEmail } from "@/lib/email/templates/AcknowledgementEmail";

// DELETE THIS FILE before deploying to production.
// Hit GET /api/dev/notify-smoke while logged in to test the full notify() pipeline.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  await notify({
    recipientId: user.id,
    type: "acknowledgement",
    message: "Smoke test — your submission has been received.",
    emailSubject: "OPS smoke test: submission received",
    emailHtml: AcknowledgementEmail({
      recipientName: user.email ?? "there",
      projectId: "SMOKE-001",
      expectedDeliveryDate: "12 Jun 2026",
      portalUrl: "http://localhost:3000",
    }),
  });

  return NextResponse.json({ ok: true, recipientId: user.id });
}
