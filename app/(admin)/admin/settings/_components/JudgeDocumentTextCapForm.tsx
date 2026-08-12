"use client";

import { useActionState } from "react";
import {
  updateJudgeDocumentTextCapAction,
  type UpdateJudgeDocumentTextCapState,
} from "@/app/actions/settings";

export function JudgeDocumentTextCapForm({ cap }: { cap: number }) {
  const [state, action, pending] = useActionState<UpdateJudgeDocumentTextCapState, FormData>(
    updateJudgeDocumentTextCapAction,
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">File-requirement judge document cap</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        How many characters of an uploaded document&apos;s text get sent to the AI judge that
        checks a file against what was expected for its upload slot. Raise this if long documents
        are being judged on an incomplete excerpt; lower it to reduce judge-call cost.
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
            min={1}
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
