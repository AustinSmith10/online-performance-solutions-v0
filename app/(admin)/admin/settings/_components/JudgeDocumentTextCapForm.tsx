"use client";

import { SettingsSaveButton } from "./SettingsSaveButton";
import { useFormDirty } from "@/hooks/useFormDirty";
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

  const { dirty, formProps } = useFormDirty(!!state.errors);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Upload-check document cap</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        How many characters of an uploaded document&apos;s text are sent to the AI check that
        confirms a file matches its upload slot (e.g. that a PO is really a PO). Only affects that
        check — field extraction has its own cap above. Raise this if long documents are being
        judged on an incomplete excerpt; lower it to reduce cost.
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="rise-in mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p role="status" className="rise-in mt-4 text-sm font-medium text-green-700">Document cap updated.</p>
      )}

      <form action={action} {...formProps} className="mt-5 flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700">Characters per document</label>
          <input
            name="cap"
            type="number"
            min={1}
            step={1}
            defaultValue={cap}
            required
            className="mt-1 block w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm transition-colors duration-150 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {state.errors?.cap && <p className="mt-1 text-xs text-red-600">{state.errors.cap[0]}</p>}
        </div>
        <SettingsSaveButton pending={pending} dirty={dirty} />
      </form>
    </div>
  );
}
