import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types";

export type ProjectPhase = "draft" | "active";

interface Actor {
  id: string;
  email?: string;
  role: string;
  client_id?: unknown;
}

// Whatever the caller needs from the row is on it — every existing call site
// already free-selects columns off a project row it fetched itself, so this
// mirrors that rather than constraining callers to a narrower shape.
export type AccessibleProject = Record<string, unknown> & {
  id: string;
  client_id: string | null;
  submitted_by: string | null;
  assigned_consultant_id: string | null;
  status: string;
  extracted_fields: unknown;
};

// The CRITICAL cross-tenant IDOR fix (#160). Centralizes the access model
// documented in SECURITY-FIX-PLAN.md Part 3 / issue #160:
//
//   | Role         | Draft phase                                    | Active phase                        |
//   |--------------|-------------------------------------------------|--------------------------------------|
//   | stakeholder  | client_id match AND submitted_by == actor.id     | client_id match AND (submitter OR reviewer) |
//   | consultant   | assigned_consultant_id == actor.id (uniform)     | assigned_consultant_id == actor.id  |
//   | admin/super  | unfiltered                                       | unfiltered                          |
//
// The consultant row is identical in both phases only because #149 now
// auto-assigns a consultant to their own on-behalf-of draft at creation —
// without that, there would be no column recording which consultant is
// "working" an unsubmitted draft at all.
//
// Returns null on any denial (not found, soft-deleted, wrong tenant, wrong
// role relationship) rather than throwing — every call site already returns
// an error object on failure, and a thrown error from here would surface as
// an unhandled Server Action rejection instead of the same "not found or
// access denied" message every other failure path already uses. Callers
// should not distinguish "doesn't exist" from "exists but you can't touch
// it" in what they show the caller — that distinction is exactly what an
// IDOR fix is supposed to stop leaking.
//
// `phase` is optional: most callers don't know a project's phase ahead of
// fetching it, so when omitted this derives it from the row's own `status`
// (anything other than "draft" counts as active). Pass it explicitly only
// when a caller has an independent reason to assert a specific phase.
export async function requireProjectAccess(
  supabase: SupabaseClient,
  actor: Actor,
  projectId: string,
  phase?: ProjectPhase
): Promise<AccessibleProject | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return null;

  const row = project as AccessibleProject;
  const effectivePhase: ProjectPhase = phase ?? (row.status === "draft" ? "draft" : "active");
  const role = actor.role as UserRole;

  if (role === "super_admin" || role === "admin") {
    return row;
  }

  if (role === "consultant") {
    return row.assigned_consultant_id === actor.id ? row : null;
  }

  if (role === "stakeholder") {
    if (row.client_id !== (actor.client_id as string | null)) return null;
    if (row.submitted_by === actor.id) return row;
    if (effectivePhase === "draft") return null; // draft phase: submitter only, no reviewer grant yet

    // Active phase: also allow a stakeholder who's been asked to review this
    // specific project, even though they didn't submit it (lib/portal/access.ts
    // implements the same submitter-or-reviewer rule for the project *list*
    // pages — this is the single-project equivalent for a write action).
    if (!actor.email) return null;
    const { data: review } = await supabase
      .from("stakeholder_reviews")
      .select("id")
      .eq("project_id", projectId)
      .eq("stakeholder_email", actor.email)
      .maybeSingle();
    return review ? row : null;
  }

  return null;
}
