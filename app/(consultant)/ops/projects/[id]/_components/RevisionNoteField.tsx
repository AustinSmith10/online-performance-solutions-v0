"use client";

import { useState } from "react";

export function RevisionNoteField({
  reviewerNames,
  required = false,
}: {
  reviewerNames: string[];
  required?: boolean;
}) {
  const [note, setNote] = useState("");

  return (
    <div className="space-y-2">
      <label htmlFor="revision-note" className="block text-xs font-medium text-zinc-700">
        Note on this revision{required && <span className="text-red-500"> *</span>}{" "}
        <span className="font-normal text-zinc-400">
          (sent to {reviewerNames.length > 0 ? reviewerNames.join(", ") : "stakeholders"} with the new version)
        </span>
      </label>
      <textarea
        id="revision-note"
        name="revision_note"
        rows={2}
        required={required}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Rechecked and corrected the setback dimension on sheet 3."
        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
      />
      {note.trim() && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-blue-500">
            Preview — appears in the review history below
          </p>
          <p className="mt-1 text-sm text-blue-900">{note}</p>
        </div>
      )}
    </div>
  );
}
