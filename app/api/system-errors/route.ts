import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNeedsAttentionSignals } from "@/lib/admin/needs-attention";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !["admin", "super_admin"].includes(user.role as string)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await getNeedsAttentionSignals(supabase);

  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json(data);
}
