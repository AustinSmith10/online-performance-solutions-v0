import type { SupabaseClient } from "@supabase/supabase-js";

export type RevisionDocType = "pbdb" | "pbdr";
export type RevisionEvent = "initial" | "rejected" | "approved_conversion";

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

/** Full project history (both doc types), oldest first — for the docx revision-history table loop. */
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
