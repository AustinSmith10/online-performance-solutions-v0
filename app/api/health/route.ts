import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkSchemaDrift } from "@/lib/schema/drift-guard";

// Readiness check — pings the DB with a short timeout and returns 503 on
// failure, so an uptime monitor or Railway's healthcheckPath actually
// reflects a DB outage instead of staying green through one (AUDIT.md #08).
// Kept separate from /api/health/live so a DB blip alone doesn't trip
// Railway's ON_FAILURE restart policy — restarting ops-web doesn't fix a
// downstream Supabase problem, it just adds a redeploy on top of it.
//
// #167: also fails (503, schema: "behind") when the remote schema is older
// than the migration this build expects — a deploy that ships code ahead of
// its schema goes immediately red and the previous version keeps serving,
// instead of the drift silently taking a subsystem down for weeks.
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
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "down", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 }
    );
  }

  const drift = await checkSchemaDrift(supabase);
  if (!drift.ok) {
    return NextResponse.json(
      { ok: false, db: "up", schema: "behind", expected: drift.expected, actual: drift.actual, error: drift.reason },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, db: "up", schema: "current", migration: drift.actual });
}
