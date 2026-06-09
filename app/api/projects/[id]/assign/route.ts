import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { performAssignment } from "@/lib/projects/assign";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;
  const body = await req.json();
  const { consultant_id } = body as { consultant_id?: string };

  if (!consultant_id) {
    return NextResponse.json({ error: "consultant_id required" }, { status: 400 });
  }

  try {
    await performAssignment(projectId, consultant_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assignment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
