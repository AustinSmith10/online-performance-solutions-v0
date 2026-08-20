import { NextResponse } from "next/server";

// Static liveness check — "is the process up", no dependency check. Use this
// for a process-level monitor; use /api/health for readiness (DB included).
export async function GET() {
  return NextResponse.json({ ok: true });
}
