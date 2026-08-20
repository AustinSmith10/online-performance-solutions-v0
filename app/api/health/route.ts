import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Readiness check — pings the DB with a short timeout and returns 503 on
// failure, so an uptime monitor or Railway's healthcheckPath actually
// reflects a DB outage instead of staying green through one (AUDIT.md #08).
// Kept separate from /api/health/live so a DB blip alone doesn't trip
// Railway's ON_FAILURE restart policy — restarting ops-web doesn't fix a
// downstream Supabase problem, it just adds a redeploy on top of it.
export async function GET() {
  const supabase = createAdminClient();
  const timeoutMs = 3000;

  try {
    const check = supabase.from("clients").select("id", { head: true, count: "exact" }).limit(1);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Health check DB ping timed out")), timeoutMs)
    );

    const { error } = await Promise.race([check, timeout]) as Awaited<typeof check>;
    if (error) throw error;

    return NextResponse.json({ ok: true, db: "up" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "down", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 }
    );
  }
}
