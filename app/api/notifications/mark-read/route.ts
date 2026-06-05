import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] | undefined = body.ids;

  let query = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", user.id);

  if (Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  } else {
    query = query.eq("is_read", false);
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
