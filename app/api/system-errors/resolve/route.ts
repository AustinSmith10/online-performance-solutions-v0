import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !["admin", "super_admin"].includes(user.role as string)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const signalId: string | undefined = body.signalId;
  if (!signalId) {
    return NextResponse.json({ error: "signalId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("resolved_signals")
    .upsert({ signal_id: signalId, resolved_by: user.id }, { onConflict: "signal_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
