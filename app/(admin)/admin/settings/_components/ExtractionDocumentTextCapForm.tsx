"use client";

import { useActionState } from "react";
import {
  updateExtractionDocumentTextCapAction,
  type UpdateExtractionDocumentTextCapState,
} from "@/app/actions/settings";
import {
  MAX_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP,
  MIN_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP,
} from "@/lib/settings/extraction-document-text-cap";

export function ExtractionDocumentTextCapForm({ cap }: { cap: number }) {
  const [state, action, pending] = useActionState<UpdateExtractionDocumentTextCapState, FormData>(
    updateExtractionDocumentTextCapAction,
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Field extraction document cap</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        How many characters of each document&apos;s text are sent to the AI that extracts project
        fields — the largest AI cost per submission. Text beyond this is not read. Can be lowered to
        reduce cost; the maximum is {MAX_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP.toLocaleString("en-AU")}{" "}
        (the extraction timeout is sized for that).
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="mt-4 text-sm font-medium text-green-700">Document cap updated.</p>
      )}

      <form action={action} className="mt-5 flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700">Characters per document</label>
          <input
            name="cap"
            type="number"
            min={MIN_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP}
            max={MAX_EXTRACTION_DOCUMENT_TEXT_CHAR_CAP}
            step={1}
            defaultValue={cap}
            required
            className="mt-1 block w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {state.errors?.cap && <p className="mt-1 text-xs text-red-600">{state.errors.cap[0]}</p>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
