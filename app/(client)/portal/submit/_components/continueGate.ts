// Pure Continue-button gate for the real-time per-file pipeline (#115) —
// mirrors app/actions/submission-pipeline.ts's getDraftPipelineStatus
// server-side readyToContinue computation, but kept as its own tested
// client-side function per the PRD: "a good target for focused component/
// unit test given it's a real correctness boundary a stakeholder depends
// on." The server's boolean is a convenience default; this is the source of
// truth the Continue button's `disabled` prop is driven by.

export type ExtractionStatus = "not_applicable" | "pending" | "running" | "completed" | "failed";

export interface PipelineFileForGate {
  slug: string;
  verificationCompleted: boolean;
  mismatchReasons: string[] | null;
  confirmed: boolean;
  extractionStatus: ExtractionStatus;
}

export interface RequirementForGate {
  slug: string;
  required: boolean;
}

/**
 * Continue is enabled only when every required slot has at least one file,
 * every file's verification has resolved, every file's extraction (where
 * applicable) has completed, and every flagged file has been confirmed —
 * this is a strict superset of "no unconfirmed flags": a clean file whose
 * extraction is still running still blocks Continue.
 */
export function canContinue(files: PipelineFileForGate[], requirements: RequirementForGate[]): boolean {
  const filesBySlug = new Map<string, PipelineFileForGate[]>();
  for (const f of files) {
    filesBySlug.set(f.slug, [...(filesBySlug.get(f.slug) ?? []), f]);
  }

  const everyRequiredSlotFilled = requirements
    .filter((r) => r.required)
    .every((r) => (filesBySlug.get(r.slug)?.length ?? 0) > 0);
  if (!everyRequiredSlotFilled) return false;

  return files.every(
    (f) =>
      f.verificationCompleted &&
      (f.extractionStatus === "not_applicable" || f.extractionStatus === "completed") &&
      (!f.mismatchReasons || f.confirmed)
  );
}
