import { CollapsibleSection } from "./CollapsibleSection";
import { FlagAcknowledgeControl } from "./FlagAcknowledgeControl";
import type { FieldFlagCandidate } from "@/components/field-flag-review";
import type { FlagType } from "@/lib/documents/field-flags";

export interface FlagRow {
  id: string;
  label: string;
  status: "open" | "resolved";
  type: FlagType;
  currentValue: string;
  candidates: FieldFlagCandidate[];
  resolvedByEmail?: string | null;
  resolvedAt?: string | null;
  acknowledgedByEmail?: string | null;
  acknowledgedAt?: string | null;
}

interface Props {
  flags: FlagRow[];
  /** original_filename -> signed URL, for resolving a candidate's source_document to a preview. */
  sourceUrlsByFilename: Record<string, string | null>;
}

// Acknowledgment only — deliberately not a second place to browse candidates
// or preview sources; that lives inline in Submitted details next to each
// field (FieldFlagReview), regardless of this flag's resolution status. This
// stays a distinct, lightweight action list per the user's call that
// acknowledgment can live separately from where candidates/preview live.
export function FlagAcknowledgmentSection({ flags, sourceUrlsByFilename }: Props) {
  if (flags.length === 0) return null;

  return (
    <CollapsibleSection
      title="Flag acknowledgments"
      subtitle="Confirm you've reviewed each flagged field's source document, whether or not the stakeholder resolved it."
      defaultOpen={flags.some((f) => !f.acknowledgedAt)}
    >
      <div className="divide-y divide-zinc-100">
        {flags.map((flag) => {
          const acceptedCandidate =
            flag.candidates.find((c) => c.value === flag.currentValue) ?? flag.candidates[0];
          const sourceUrl = acceptedCandidate
            ? sourceUrlsByFilename[acceptedCandidate.source_document] ?? null
            : null;

          return (
            <div key={flag.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{flag.label}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {flag.currentValue || "(empty)"}
                  {flag.status === "resolved" && flag.resolvedByEmail && (
                    <span className="text-zinc-400">
                      {" "}
                      — resolved by {flag.resolvedByEmail}
                      {flag.resolvedAt && ` on ${new Date(flag.resolvedAt).toLocaleDateString("en-AU")}`}
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0">
                {flag.acknowledgedAt ? (
                  <p className="text-xs text-green-700">
                    ✓ Acknowledged by {flag.acknowledgedByEmail ?? "a consultant"} on{" "}
                    {new Date(flag.acknowledgedAt).toLocaleDateString("en-AU")}
                  </p>
                ) : (
                  <FlagAcknowledgeControl
                    flagId={flag.id}
                    sourceUrl={sourceUrl}
                    sourceFilename={acceptedCandidate?.source_document}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
