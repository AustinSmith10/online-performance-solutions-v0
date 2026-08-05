import type { SupabaseClient } from "@supabase/supabase-js";

export type RevisionDocType = "pbdb" | "pbdr";
// "reverted" — a consultant/admin sends a delivered PBDR back to the PBDB QA
// cycle after a stakeholder finds a post-approval issue. Distinct from
// "rejected" (a stakeholder declining during review) so the audit trail can
// tell the two apart.
export type RevisionEvent = "initial" | "rejected" | "approved_conversion" | "reverted";

export interface RevisionHistoryRow {
  rev_number: number;
  doc_type: RevisionDocType;
  event: RevisionEvent;
  prepared_by: string | null;
  created_at: string;
}

/**
 * Appends one row to `revision_history` and returns its rev_number.
 *
 * `prepared_by` snapshots the consultant currently assigned to the project
 * at the moment the event fires — never the literal actor. If an admin
 * manually triggers the action (e.g. a PBDR conversion failsafe), the row
 * still credits the assigned consultant. This is deliberate and different
 * from the general audit-trail `resolved_by`-style pattern used elsewhere
 * (e.g. field_flags.resolved_by), which always records the literal actor.
 * Existing rows are never rewritten by a later reassignment.
 */
/** What recordRevisionEvent would insert next, without inserting it — for callers that need the number to build a filename before the operation that earns it has actually succeeded. */
export async function peekNextRevNumber(
  supabase: SupabaseClient,
  projectId: string,
  docType: RevisionDocType
): Promise<number> {
  const { data: existing } = await supabase
    .from("revision_history")
    .select("rev_number")
    .eq("project_id", projectId)
    .eq("doc_type", docType)
    .order("rev_number", { ascending: false })
    .limit(1);

  return existing && existing.length > 0 ? (existing[0].rev_number as number) + 1 : 0;
}

export async function recordRevisionEvent(
  supabase: SupabaseClient,
  projectId: string,
  docType: RevisionDocType,
  event: RevisionEvent
): Promise<number> {
  const [{ data: project }, nextRev] = await Promise.all([
    supabase.from("projects").select("assigned_consultant_id").eq("id", projectId).maybeSingle(),
    peekNextRevNumber(supabase, projectId, docType),
  ]);

  const { error } = await supabase.from("revision_history").insert({
    project_id: projectId,
    doc_type: docType,
    rev_number: nextRev,
    prepared_by: (project?.assigned_consultant_id as string | null) ?? null,
    event,
  });

  if (error) throw new Error(`Failed to record revision history: ${error.message}`);

  return nextRev;
}

/** The current (highest) rev_number for a project/doc_type, or 0 if no rows exist yet. */
export async function getCurrentRevNumber(
  supabase: SupabaseClient,
  projectId: string,
  docType: RevisionDocType
): Promise<number> {
  const { data } = await supabase
    .from("revision_history")
    .select("rev_number")
    .eq("project_id", projectId)
    .eq("doc_type", docType)
    .order("rev_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.rev_number as number | undefined) ?? 0;
}

/** Full project history (both doc types), oldest first — callers filter to the doc type their document actually renders. */
export async function getRevisionHistory(
  supabase: SupabaseClient,
  projectId: string
): Promise<RevisionHistoryRow[]> {
  const { data } = await supabase
    .from("revision_history")
    .select("rev_number, doc_type, event, prepared_by, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return (data ?? []) as RevisionHistoryRow[];
}

export interface FormattedRevisionRow {
  DOC_TYPE: string;
  REV_NUMBER: string;
  EVENT: string;
  PREPARED_BY: string;
  DATE: string;
}

// Purpose is constant per doc type, not per event — "Stakeholder Review" for
// every PBDB row, "For Construction" for every PBDR row. This mirrors
// lib/documents/converter.ts's PBDB→PBDR text swap (#4 — Revision History
// PURPOSE column), which does a literal "Stakeholder Review" → "For
// Construction" replacement, not anything event-aware.
export const REVISION_PURPOSE_LABELS: Record<RevisionDocType, string> = {
  pbdb: "Stakeholder Review",
  pbdr: "For Construction",
};

/**
 * Resolves `prepared_by` user ids to display names and formats each row for
 * a document's revision-history table. Shared by generatePbdb() (rendered
 * via a docxtemplater loop) and deliverPbdr() (rebuilt via XML surgery,
 * since PBDR conversion never re-renders through docxtemplater) so both
 * documents produce identically-shaped rows.
 */
export async function formatRevisionHistoryRows(
  supabase: SupabaseClient,
  rows: RevisionHistoryRow[]
): Promise<FormattedRevisionRow[]> {
  const ids = [...new Set(rows.map((r) => r.prepared_by).filter((x): x is string => !!x))];
  const { data: users } = ids.length
    ? await supabase.from("users").select("id, first_name, last_name").in("id", ids)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };

  const nameById = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      [u.first_name as string | null, u.last_name as string | null].filter(Boolean).join(" "),
    ])
  );

  return rows.map((row) => ({
    DOC_TYPE: row.doc_type.toUpperCase(),
    REV_NUMBER: String(row.rev_number),
    // Context key stays EVENT (matches the template's existing {EVENT} token
    // in the Purpose column) even though its content is a doc-type-derived
    // purpose string, not the row's actual event.
    EVENT: REVISION_PURPOSE_LABELS[row.doc_type] ?? row.doc_type,
    PREPARED_BY: row.prepared_by ? (nameById.get(row.prepared_by) ?? "") : "",
    DATE: new Date(row.created_at).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
  }));
}
