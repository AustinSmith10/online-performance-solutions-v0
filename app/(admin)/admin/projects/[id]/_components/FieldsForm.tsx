"use client";

import { useActionState } from "react";
import { updateProjectFields, type UpdateFieldsState } from "@/app/actions/projects";

interface FieldEntry {
  token: string;
  label: string;
  value: string;
}

interface Props {
  projectId: string;
  poNumber: string | null;
  fields: FieldEntry[];
}

export function FieldsForm({ projectId, poNumber, fields }: Props) {
  const boundAction = updateProjectFields.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UpdateFieldsState, FormData>(
    boundAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">PO number</label>
        <input
          type="text"
          name="po_number"
          defaultValue={poNumber ?? ""}
          className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-zinc-500">No field values have been captured yet.</p>
      )}

      {fields.map(({ token, label, value }) => (
        <div key={token}>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            {label}
            <span className="ml-2 font-mono text-zinc-400">{token}</span>
          </label>
          <input
            type="text"
            name={token}
            defaultValue={value}
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.success && (
          <p className="text-sm text-green-600">Saved and audit logged.</p>
        )}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
