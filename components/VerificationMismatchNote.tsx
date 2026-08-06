/**
 * Inline visibility (#115) for a stakeholder-confirmed verification mismatch
 * — i.e. the stakeholder saw the #113 soft warning and overrode it. Styled
 * like the PBDB filename-mismatch note (PbdbSendPreview.tsx's amber card),
 * but visibility-only: #74 already decided against a hard-block/acknowledge
 * gate for this class of flag, so there's no checkbox here, just the note.
 */
export function VerificationMismatchNote({ reasons }: { reasons: string[] }) {
  return (
    <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
      <p className="text-[11px] font-semibold text-amber-800">
        Stakeholder confirmed this file despite a flagged mismatch
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-800">
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
